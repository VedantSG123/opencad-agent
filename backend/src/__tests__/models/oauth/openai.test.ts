import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import type { Auth } from '../../../models/auth'
import type { Model, Provider } from '../../../models/schemas'

const persisted: Array<[string, Auth]> = []

const realAuth = await import('../../../models/auth')

// The real store writes to the user's auth.json outside Electron. Bun's module
// mocks are process-wide, so the other exports must survive for other suites.
void mock.module('../../../models/auth', () => ({
  ...realAuth,
  set: (providerId: string, auth: Auth) => {
    persisted.push([providerId, auth])
    return Promise.resolve()
  },
}))

const { extractAccountId, loadOpenaiProviderWithAuth } =
  await import('../../../models/oauth/openai')

function jwt(claims: object): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `header.${payload}.signature`
}

function openaiProvider(): Provider {
  const model = {
    id: 'gpt-6-sol',
    providerId: 'openai',
    api: { id: 'gpt-6-sol', url: 'https://api.openai.com/v1', npm: '' },
  } as Model
  return {
    id: 'openai',
    name: 'OpenAI',
    options: {},
    models: { [model.id]: model },
  }
}

function oauth(overrides: Partial<Auth & { type: 'oauth' }> = {}): Auth {
  return {
    type: 'oauth',
    access: 'access-token',
    refresh: 'refresh-token',
    expires: Date.now() + 60_000,
    accountId: 'acct_123',
    ...overrides,
  }
}

type Captured = { url: string; headers: Headers; body?: string }

const realFetch = globalThis.fetch
let captured: Captured[] = []
let respond: (url: string) => Response = () => new Response('{}')

beforeEach(() => {
  captured = []
  persisted.length = 0
  respond = () => new Response('{}')
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    captured.push({
      url,
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : undefined,
    })
    return Promise.resolve(respond(url))
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

function sdkFetch(provider: Provider) {
  return provider.options.fetch as (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>
}

describe('loadOpenaiProviderWithAuth', () => {
  test('points models at the Codex base URL, leaving the path to the SDK', () => {
    const provider = loadOpenaiProviderWithAuth(oauth(), openaiProvider())
    expect(provider.models['gpt-6-sol'].api.url).toBe(
      'https://chatgpt.com/backend-api/codex',
    )
  })

  test('asks every call not to be stored, which the Codex backend requires', () => {
    const provider = loadOpenaiProviderWithAuth(oauth(), openaiProvider())
    expect(provider.callOptions).toEqual({ openai: { store: false } })
  })

  test('sends the token, account and originator to chatgpt.com', async () => {
    const provider = loadOpenaiProviderWithAuth(oauth(), openaiProvider())
    await sdkFetch(provider)(
      'https://chatgpt.com/backend-api/codex/responses',
      { headers: { Authorization: 'Bearer oauth-dummy-key' } },
    )

    expect(captured).toHaveLength(1)
    expect(captured[0].url).toBe(
      'https://chatgpt.com/backend-api/codex/responses',
    )
    expect(captured[0].headers.get('authorization')).toBe('Bearer access-token')
    expect(captured[0].headers.get('chatgpt-account-id')).toBe('acct_123')
    expect(captured[0].headers.get('originator')).toBe('opencad')
  })

  test('never sends the token to another host', async () => {
    const provider = loadOpenaiProviderWithAuth(oauth(), openaiProvider())
    await sdkFetch(provider)('https://example.com/v1/responses', {
      headers: { Authorization: 'Bearer oauth-dummy-key' },
    })

    expect(captured[0].headers.get('authorization')).toBeNull()
    expect(captured[0].headers.get('chatgpt-account-id')).toBeNull()
  })

  test('refreshes an expired token once and keeps using the new one', async () => {
    respond = (url) =>
      url === 'https://auth.openai.com/oauth/token'
        ? Response.json({
            access_token: 'fresh-access',
            refresh_token: 'fresh-refresh',
            id_token: jwt({ chatgpt_account_id: 'acct_123' }),
            expires_in: 3600,
          })
        : new Response('{}')

    const provider = loadOpenaiProviderWithAuth(
      oauth({ expires: Date.now() - 1 }),
      openaiProvider(),
    )
    const call = sdkFetch(provider)
    await call('https://chatgpt.com/backend-api/codex/responses')
    await call('https://chatgpt.com/backend-api/codex/responses')

    const refreshes = captured.filter(
      (c) => c.url === 'https://auth.openai.com/oauth/token',
    )
    expect(refreshes).toHaveLength(1)
    const codexCalls = captured.filter((c) => c.url.includes('chatgpt.com'))
    expect(codexCalls.map((c) => c.headers.get('authorization'))).toEqual([
      'Bearer fresh-access',
      'Bearer fresh-access',
    ])
    expect(persisted).toHaveLength(1)
    expect(persisted[0][1]).toMatchObject({
      access: 'fresh-access',
      refresh: 'fresh-refresh',
    })
  })

  test('surfaces the server response when a refresh is rejected', async () => {
    respond = () => new Response('{"error":"invalid_grant"}', { status: 400 })

    const provider = loadOpenaiProviderWithAuth(
      oauth({ expires: Date.now() - 1 }),
      openaiProvider(),
    )

    const error = await sdkFetch(provider)(
      'https://chatgpt.com/backend-api/codex/responses',
    ).then(
      () => null,
      (reason: unknown) => reason,
    )
    expect(String(error)).toContain('invalid_grant')
  })
})

describe('extractAccountId', () => {
  test('reads the account from the ID token', () => {
    expect(
      extractAccountId({
        id_token: jwt({
          'https://api.openai.com/auth': { chatgpt_account_id: 'acct_id' },
        }),
        access_token: jwt({ chatgpt_account_id: 'acct_access' }),
      }),
    ).toBe('acct_id')
  })

  test('falls back to the access token when the ID token has no account', () => {
    expect(
      extractAccountId({
        id_token: jwt({ email: 'someone@example.com' }),
        access_token: jwt({ chatgpt_account_id: 'acct_access' }),
      }),
    ).toBe('acct_access')
  })

  test('never mistakes an organization for the ChatGPT account', () => {
    expect(
      extractAccountId({
        id_token: jwt({ organizations: [{ id: 'org_1' }] }),
        access_token: 'not-a-jwt',
      }),
    ).toBeUndefined()
  })
})
