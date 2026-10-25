import * as crypto from 'crypto'
import { createServer, type Server } from 'http'

import z from 'zod'

import { logger } from '../../utils/logger'
import { oauthCallbackPage } from '../../utils/oauthPage'
import type { Auth } from '../auth'
import { set as setAuth } from '../auth'
import type { Model, Provider } from '../schemas'
import type { Authorization, CallbackResult, OAuthProvider } from './types'

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const ISSUER = 'https://auth.openai.com'
const CODEX_HOST = 'chatgpt.com'
const CODEX_BASE_URL = `https://${CODEX_HOST}/backend-api/codex`
const ORIGINATOR = 'opencad'
const OAUTH_PORT = 1455
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/auth/callback`
const SCOPE = 'openid profile email offline_access'
const OAUTH_DUMMY_KEY = 'oauth-dummy-key'
// The catalog hides any model whose `minimal_client_version` is above the
// version asked for. We run our own agent loop rather than the Codex CLI's, so
// we ask as a client new enough for all of them.
const CODEX_CLIENT_VERSION = '999.0.0'
const CATALOG_TTL_MS = 60 * 60 * 1000

import { base64UrlEncode, generatePKCE, type PkceCodes } from './pkce.js'

interface TokenResponse {
  id_token: string
  access_token: string
  refresh_token: string
  expires_in?: number
}

export interface IdTokenClaims {
  chatgpt_account_id?: string
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

function accountIdFromClaims(token: string | undefined): string | undefined {
  const claims = token ? parseJwtClaims(token) : undefined
  return (
    claims?.chatgpt_account_id ||
    claims?.['https://api.openai.com/auth']?.chatgpt_account_id
  )
}

export function extractAccountId(
  tokens: Pick<TokenResponse, 'id_token' | 'access_token'>,
): string | undefined {
  return (
    accountIdFromClaims(tokens.id_token) ??
    accountIdFromClaims(tokens.access_token)
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
    originator: ORIGINATOR,
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
    throw new Error(
      `OpenAI token exchange failed: ${response.status} ${await response.text()}`,
    )
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
    throw new Error(
      `OpenAI token refresh failed: ${response.status} ${await response.text()}`,
    )
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
  description: 'ChatGPT Pro/Plus',

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

type OAuth = Extract<Auth, { type: 'oauth' }>

async function refreshAuth(providerId: string, auth: OAuth): Promise<OAuth> {
  const tokens = await refreshAccessToken(auth.refresh)
  const refreshed: OAuth = {
    type: 'oauth',
    access: tokens.access_token,
    refresh: tokens.refresh_token || auth.refresh,
    expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    accountId: extractAccountId(tokens) ?? auth.accountId,
  }
  await setAuth(providerId, refreshed).catch(() => {})
  return refreshed
}

type SdkFetch = (
  request: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

function createCodexFetch(providerId: string, auth: OAuth): SdkFetch {
  let current = auth
  return async (request, init) => {
    const url = new URL(request instanceof Request ? request.url : request)
    const headers = new Headers(init?.headers)
    headers.delete('authorization')

    if (url.hostname === CODEX_HOST) {
      if (current.expires < Date.now()) {
        current = await refreshAuth(providerId, current)
      }
      headers.set('authorization', `Bearer ${current.access}`)
      headers.set('originator', ORIGINATOR)
      if (current.accountId) {
        headers.set('chatgpt-account-id', current.accountId)
      }
    }

    return fetch(request, { ...init, headers })
  }
}

const CodexModelSchema = z.object({
  slug: z.string(),
  display_name: z.string(),
  visibility: z.string(),
  context_window: z.number(),
  input_modalities: z.array(z.string()).default(['text']),
  supported_reasoning_levels: z
    .array(z.object({ effort: z.string() }))
    .default([]),
})

type CodexModel = z.infer<typeof CodexModelSchema>

const CodexCatalogSchema = z.object({ models: z.array(CodexModelSchema) })

let catalogCache: {
  accountId: string | undefined
  fetchedAt: number
  models: CodexModel[]
} | null = null

async function fetchCodexCatalog(
  codexFetch: SdkFetch,
  accountId: string | undefined,
): Promise<CodexModel[]> {
  if (
    catalogCache &&
    catalogCache.accountId === accountId &&
    Date.now() - catalogCache.fetchedAt < CATALOG_TTL_MS
  ) {
    return catalogCache.models
  }

  const response = await codexFetch(
    `${CODEX_BASE_URL}/models?client_version=${CODEX_CLIENT_VERSION}`,
    { headers: { accept: 'application/json' } },
  )
  if (!response.ok) {
    throw new Error(
      `Codex model catalog request failed: ${response.status} ${await response.text()}`,
    )
  }
  const { models } = CodexCatalogSchema.parse(await response.json())
  // Anything not marked "list" is internal or retired.
  const listed = models.filter((model) => model.visibility === 'list')
  catalogCache = { accountId, fetchedAt: Date.now(), models: listed }
  return listed
}

function toModel(provider: Provider, entry: CodexModel): Model {
  const known = provider.models[entry.slug]
  if (known) {
    return {
      ...known,
      api: { ...known.api, url: CODEX_BASE_URL },
      limit: { ...known.limit, context: entry.context_window },
    }
  }

  const accepts = (modality: string) =>
    entry.input_modalities.includes(modality)
  return {
    id: entry.slug,
    providerId: provider.id,
    name: entry.display_name,
    api: { id: entry.slug, url: CODEX_BASE_URL, npm: '@ai-sdk/openai' },
    capabilities: {
      temperature: false,
      reasoning: entry.supported_reasoning_levels.length > 0,
      attachment: accepts('image'),
      toolcall: true,
      input: {
        text: true,
        audio: accepts('audio'),
        image: accepts('image'),
        video: accepts('video'),
        pdf: accepts('pdf'),
      },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      interlaved: false,
    },
    // The catalog states no output limit; the context window bounds it.
    limit: { context: entry.context_window, output: entry.context_window },
    release_date: '',
    free: false,
  }
}

export async function loadOpenaiProviderWithAuth(
  auth: Auth,
  provider: Provider,
): Promise<Provider> {
  if (auth.type !== 'oauth') {
    return provider
  }

  const codexFetch = createCodexFetch(provider.id, auth)
  provider.options = { apiKey: OAUTH_DUMMY_KEY, fetch: codexFetch }
  // The Codex backend rejects stored responses. Without this the SDK also
  // replays earlier turns as `item_reference`s to items that were never kept.
  provider.callOptions = { openai: { store: false } }

  try {
    const catalog = await fetchCodexCatalog(codexFetch, auth.accountId)
    provider.models = Object.fromEntries(
      catalog.map((entry) => [entry.slug, toModel(provider, entry)]),
    )
  } catch (error) {
    // Offline or a rejected token: the request itself will fail with the
    // real reason, so the picker falls back to the models.dev list meanwhile.
    logger.warn({ error }, 'Could not fetch the ChatGPT model catalog')
    for (const model of Object.values(provider.models)) {
      model.api.url = CODEX_BASE_URL
    }
  }

  return provider
}
