import * as crypto from 'crypto'
import { createServer, type Server } from 'http'

import { oauthCallbackPage } from '../../utils/oauthPage'
import type { Auth } from '../auth'
import { set as setAuth } from '../auth'
import type { Provider } from '../schemas'
import type { Authorization, CallbackResult, OAuthProvider } from './types'

const CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828'
const AUTHORIZE_URL = 'https://auth.x.ai/oauth2/authorize'
const TOKEN_URL = 'https://auth.x.ai/oauth2/token'
const OAUTH_PORT = 56121
const OAUTH_REDIRECT_PATH = '/callback'
const REDIRECT_URI = `http://127.0.0.1:${OAUTH_PORT}${OAUTH_REDIRECT_PATH}`
const SCOPE = 'openid profile email offline_access grok-cli:access api:access'
const OAUTH_DUMMY_KEY = 'oauth-dummy-key'

import { base64UrlEncode, generatePKCE, type PkceCodes } from './pkce.js'

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in?: number
}

function buildAuthorizeUrl(
  pkce: PkceCodes,
  state: string,
  nonce: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    plan: 'generic',
    referrer: 'opencad',
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

async function exchangeCodeForTokens(
  code: string,
  pkce: PkceCodes,
): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: pkce.verifier,
    }).toString(),
  })
  if (!response.ok) {
    throw new Error(`xAI token exchange failed: ${response.status}`)
  }
  return response.json() as Promise<TokenResponse>
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
  })
  if (!response.ok) {
    throw new Error(`xAI token refresh failed: ${response.status}`)
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
    const url = new URL(req.url || '/', `http://127.0.0.1:${OAUTH_PORT}`)

    if (url.pathname === OAUTH_REDIRECT_PATH) {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const error = url.searchParams.get('error')
      const errorDescription = url.searchParams.get('error_description')

      if (error) {
        const errorMsg = errorDescription || error
        pendingOAuth?.reject(new Error(errorMsg))
        pendingOAuth = null
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(oauthCallbackPage.error(errorMsg, 'xAI'))
        return
      }

      if (!code) {
        const errorMsg = 'Missing authorization code'
        pendingOAuth?.reject(new Error(errorMsg))
        pendingOAuth = null
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(oauthCallbackPage.error(errorMsg, 'xAI'))
        return
      }

      if (!pendingOAuth || state !== pendingOAuth.state) {
        const errorMsg = 'Invalid state - potential CSRF attack'
        pendingOAuth?.reject(new Error(errorMsg))
        pendingOAuth = null
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(oauthCallbackPage.error(errorMsg, 'xAI'))
        return
      }

      const current = pendingOAuth
      pendingOAuth = null

      exchangeCodeForTokens(code, current.pkce)
        .then((tokens) => current.resolve(tokens))
        .catch((err) => current.reject(err as Error))

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(oauthCallbackPage.success('xAI'))
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
    server.listen(OAUTH_PORT, '127.0.0.1', () => {
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

export const xaiOAuthProvider: OAuthProvider = {
  id: 'xai',
  title: 'xAI Grok',
  description: 'Sign in with your xAI Grok account to use Grok models.',

  async authorize(): Promise<Authorization> {
    await startOAuthServer()
    const pkce = generatePKCE()
    const state = base64UrlEncode(crypto.randomBytes(32))
    const nonce = base64UrlEncode(crypto.randomBytes(32))
    const authUrl = buildAuthorizeUrl(pkce, state, nonce)

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

      return {
        type: 'success',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      }
    } catch (err) {
      stopOAuthServer()
      return { type: 'failed', error: (err as Error).message }
    }
  },
}

export function loadXaiProviderWithAuth(
  auth: Auth,
  provider: Provider,
): Provider {
  if (auth.type !== 'oauth') {
    return provider
  }

  for (const model of Object.values(provider.models)) {
    model.api.url = 'https://api.x.ai/v1'
  }

  provider.options = {
    apiKey: OAUTH_DUMMY_KEY,
    async fetch(request: RequestInfo, init?: RequestInit) {
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

          currentAuth = {
            type: 'oauth',
            access: tokens.access_token,
            refresh: refreshedRefresh,
            expires: refreshedExpires,
          }

          // Save refreshed tokens securely
          await setAuth(provider.id, currentAuth).catch(() => {})
        } catch (e) {
          console.error('Failed to auto-refresh xAI OAuth token', e)
        }
      }

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

      const parsed =
        request instanceof URL
          ? request
          : new URL(typeof request === 'string' ? request : request.url)

      const url = new URL(parsed.pathname, 'https://api.x.ai/v1')

      return fetch(url, { ...init, headers })
    },
  }

  return provider
}
