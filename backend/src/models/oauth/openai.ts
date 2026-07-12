import * as crypto from 'crypto'
import { createServer, type Server } from 'http'

import { oauthCallbackPage } from '../../utils/oauthPage'
import type { Auth } from '../auth'
import { set as setAuth } from '../auth'
import type { Provider } from '../schemas'
import type { Authorization, CallbackResult, OAuthProvider } from './types'

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const ISSUER = 'https://auth.openai.com'
const CODEX_API_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses'
const OAUTH_PORT = 1455
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/auth/callback`
const SCOPE = 'openid profile email offline_access'
const OAUTH_DUMMY_KEY = 'oauth-dummy-key'

import { base64UrlEncode, generatePKCE, type PkceCodes } from './pkce.js'

interface TokenResponse {
  id_token: string
  access_token: string
  refresh_token: string
  expires_in?: number
}

export interface IdTokenClaims {
  chatgpt_account_id?: string
  organizations?: Array<{ id: string }>
  email?: string
  'https://api.openai.com/auth'?: {
    chatgpt_account_id?: string
  }
}

export function parseJwtClaims(token: string): IdTokenClaims | undefined {
  const parts = token.split('.')
  if (parts.length !== 3) return undefined
  try {
    return JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as IdTokenClaims
  } catch {
    return undefined
  }
}

export function extractAccountId(tokens: TokenResponse): string | undefined {
  let claims: IdTokenClaims | undefined
  if (tokens.id_token) {
    claims = parseJwtClaims(tokens.id_token)
  } else if (tokens.access_token) {
    claims = parseJwtClaims(tokens.access_token)
  }
  if (!claims) return undefined
  return (
    claims.chatgpt_account_id ||
    claims['https://api.openai.com/auth']?.chatgpt_account_id ||
    claims.organizations?.[0]?.id
  )
}

function buildAuthorizeUrl(pkce: PkceCodes, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state,
    originator: 'opencad',
  })
  return `${ISSUER}/oauth/authorize?${params.toString()}`
}

async function exchangeCodeForTokens(
  code: string,
  pkce: PkceCodes,
): Promise<TokenResponse> {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: pkce.verifier,
    }).toString(),
  })
  if (!response.ok) {
    throw new Error(`OpenAI token exchange failed: ${response.status}`)
  }
  return response.json() as Promise<TokenResponse>
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenResponse> {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
  })
  if (!response.ok) {
    throw new Error(`OpenAI token refresh failed: ${response.status}`)
  }
  return response.json() as Promise<TokenResponse>
}

interface PendingOAuth {
  pkce: PkceCodes
  state: string
  resolve: (tokens: TokenResponse) => void
  reject: (error: Error) => void
}

let oauthServer: Server | null = null
let pendingOAuth: PendingOAuth | null = null

async function startOAuthServer(): Promise<void> {
  if (oauthServer) return

  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${OAUTH_PORT}`)

    if (url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const error = url.searchParams.get('error')
      const errorDescription = url.searchParams.get('error_description')

      if (error) {
        const errorMsg = errorDescription || error
        pendingOAuth?.reject(new Error(errorMsg))
        pendingOAuth = null
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(oauthCallbackPage.error(errorMsg, 'ChatGPT'))
        return
      }

      if (!code) {
        const errorMsg = 'Missing authorization code'
        pendingOAuth?.reject(new Error(errorMsg))
        pendingOAuth = null
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(oauthCallbackPage.error(errorMsg, 'ChatGPT'))
        return
      }

      if (!pendingOAuth || state !== pendingOAuth.state) {
        const errorMsg = 'Invalid state - potential CSRF attack'
        pendingOAuth?.reject(new Error(errorMsg))
        pendingOAuth = null
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(oauthCallbackPage.error(errorMsg, 'ChatGPT'))
        return
      }

      const current = pendingOAuth
      pendingOAuth = null

      exchangeCodeForTokens(code, current.pkce)
        .then((tokens) => current.resolve(tokens))
        .catch((err) => current.reject(err as Error))

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(oauthCallbackPage.success('ChatGPT'))
      return
    }

    if (url.pathname === '/cancel') {
      pendingOAuth?.reject(new Error('Login cancelled'))
      pendingOAuth = null
      res.writeHead(200)
      res.end('Login cancelled')
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })

  await new Promise<void>((resolve, reject) => {
    server.listen(OAUTH_PORT, () => {
      oauthServer = server
      resolve()
    })
    server.on('error', reject)
  })
}

function stopOAuthServer() {
  if (oauthServer) {
    oauthServer.close()
    oauthServer = null
  }
}

function waitForOAuthCallback(
  pkce: PkceCodes,
  state: string,
): Promise<TokenResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        if (pendingOAuth) {
          pendingOAuth = null
          reject(
            new Error('OAuth callback timeout - authorization took too long'),
          )
        }
      },
      5 * 60 * 1000,
    )

    pendingOAuth = {
      pkce,
      state,
      resolve: (tokens) => {
        clearTimeout(timeout)
        resolve(tokens)
      },
      reject: (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    }
  })
}

export const openaiOAuthProvider: OAuthProvider = {
  id: 'openai',
  title: 'ChatGPT Pro/Plus',
  description: 'Sign in with your ChatGPT account to use OpenAI Codex models.',

  async authorize(): Promise<Authorization> {
    await startOAuthServer()
    const pkce = generatePKCE()
    const state = base64UrlEncode(crypto.randomBytes(32))
    const authUrl = buildAuthorizeUrl(pkce, state)

    // Store state & pkce in pending session
    pendingOAuth = {
      pkce,
      state,
      resolve: () => {},
      reject: () => {},
    }

    return {
      url: authUrl,
      instructions:
        'Complete authorization in your browser. This window will close automatically.',
      method: 'auto',
      deviceCode: state,
      intervalSeconds: 0,
    }
  },

  async callback(deviceCode: string): Promise<CallbackResult> {
    if (!pendingOAuth || pendingOAuth.state !== deviceCode) {
      return { type: 'failed', error: 'OAuth session mismatch' }
    }

    try {
      const callbackPromise = waitForOAuthCallback(
        pendingOAuth.pkce,
        pendingOAuth.state,
      )
      const tokens = await callbackPromise
      stopOAuthServer()
      const accountId = extractAccountId(tokens)

      return {
        type: 'success',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
        accountId,
      }
    } catch (err) {
      stopOAuthServer()
      return { type: 'failed', error: (err as Error).message }
    }
  },
}

export function loadOpenaiProviderWithAuth(
  auth: Auth,
  provider: Provider,
): Provider {
  if (auth.type !== 'oauth') {
    return provider
  }

  for (const model of Object.values(provider.models)) {
    model.api.url = CODEX_API_ENDPOINT
  }

  provider.options = {
    apiKey: OAUTH_DUMMY_KEY,
    async fetch(request: RequestInfo, init?: RequestInit) {
      // 1. Delete standard authorization headers to avoid conflicts
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.delete('authorization')
          init.headers.delete('Authorization')
        } else if (Array.isArray(init.headers)) {
          init.headers = init.headers.filter(
            ([key]) => key.toLowerCase() !== 'authorization',
          )
        } else {
          delete init.headers['authorization']
          delete init.headers['Authorization']
        }
      }

      // 2. Fetch current OAuth config
      let currentAuth = auth
      if (
        currentAuth.type === 'oauth' &&
        (!currentAuth.access || currentAuth.expires < Date.now())
      ) {
        try {
          const tokens = await refreshAccessToken(currentAuth.refresh)
          const refreshedExpires =
            Date.now() + (tokens.expires_in ?? 3600) * 1000
          const refreshedRefresh = tokens.refresh_token || currentAuth.refresh
          const accountId = extractAccountId(tokens) || currentAuth.accountId

          currentAuth = {
            type: 'oauth',
            access: tokens.access_token,
            refresh: refreshedRefresh,
            expires: refreshedExpires,
            accountId,
          }

          // Persist rotated tokens
          await setAuth(provider.id, currentAuth).catch(() => {})
        } catch (e) {
          console.error('Failed to auto-refresh OpenAI OAuth token', e)
        }
      }

      // 3. Inject Bearer token and headers
      const headers = new Headers()
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((value, key) => headers.set(key, value))
        } else if (Array.isArray(init.headers)) {
          for (const [key, value] of init.headers) {
            if (value !== undefined) headers.set(key, String(value))
          }
        } else {
          for (const [key, value] of Object.entries(init.headers)) {
            if (value !== undefined) headers.set(key, String(value))
          }
        }
      }

      headers.set('authorization', `Bearer ${currentAuth.access}`)
      if (currentAuth.type === 'oauth' && currentAuth.accountId) {
        headers.set('ChatGPT-Account-Id', currentAuth.accountId)
      }

      // Rewrite URL endpoint to Codex backend endpoint if matches completions path
      const parsed =
        request instanceof URL
          ? request
          : new URL(typeof request === 'string' ? request : request.url)
      const url =
        parsed.pathname.includes('/chat/completions') ||
        parsed.pathname.includes('/v1/responses')
          ? new URL(CODEX_API_ENDPOINT)
          : parsed

      return fetch(url, { ...init, headers })
    },
  }

  return provider
}
