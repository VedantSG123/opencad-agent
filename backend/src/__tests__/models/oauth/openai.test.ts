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

const CATALOG_URL =
  'https://chatgpt.com/backend-api/codex/models?client_version=999.0.0'

function catalogEntry(slug: string, overrides: object = {}) {
  return {
    slug,
    display_name: slug.toUpperCase(),
    visibility: 'list',
    context_window: 272000,
    input_modalities: ['text', 'image'],
    supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }],
    ...overrides,
  }
}

function serveCatalog(models: object[]) {
  respond = (url) =>
    url === CATALOG_URL ? Response.json({ models }) : new Response('{}')
}

/** Loads the provider, then forgets the requests loading made. */
async function load(auth: Auth = oauth()): Promise<Provider> {
  const provider = await loadOpenaiProviderWithAuth(auth, openaiProvider())
  captured = []
  return provider
}

describe('loadOpenaiProviderWithAuth', () => {
  test('points models at the Codex base URL, leaving the path to the SDK', async () => {
    const provider = await load()
    expect(provider.models['gpt-6-sol'].api.url).toBe(
      'https://chatgpt.com/backend-api/codex',
    )
  })

  test('asks every call not to be stored, which the Codex backend requires', async () => {
    const provider = await load()
    expect(provider.callOptions).toEqual({ openai: { store: false } })
  })

  test('sends the token, account and originator to chatgpt.com', async () => {
    const provider = await load()
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
    const provider = await load()
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

    const provider = await loadOpenaiProviderWithAuth(
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

    const provider = await load(oauth({ expires: Date.now() - 1 }))

    const error = await sdkFetch(provider)(
      'https://chatgpt.com/backend-api/codex/responses',
    ).then(
      () => null,
      (reason: unknown) => reason,
    )
    expect(String(error)).toContain('invalid_grant')
  })
})

// Each test uses its own account: the catalog is cached per account. The
// first one runs before anything is cached, which is the case it covers.
describe('Codex model catalog', () => {
  test('fetches the catalog for a login whose token names no account', async () => {
    serveCatalog([catalogEntry('gpt-7')])
    const provider = await load(oauth({ accountId: undefined }))

    expect(Object.keys(provider.models)).toEqual(['gpt-7'])
  })

  test('lists only the models the catalog marks as listed', async () => {
    serveCatalog([
      catalogEntry('gpt-6-sol'),
      catalogEntry('gpt-reserve', { visibility: 'hide' }),
    ])
    const provider = await load(oauth({ accountId: 'acct_listed' }))

    expect(Object.keys(provider.models)).toEqual(['gpt-6-sol'])
  })

  test('keeps the models.dev details of a model it knows, with the Codex context window', async () => {
    serveCatalog([catalogEntry('gpt-6-sol', { context_window: 123456 })])
    const provider = await load(oauth({ accountId: 'acct_known' }))

    const model = provider.models['gpt-6-sol']
    expect(model.providerId).toBe('openai')
    expect(model.api).toEqual({
      id: 'gpt-6-sol',
      url: 'https://chatgpt.com/backend-api/codex',
      npm: '',
    })
    expect(model.limit.context).toBe(123456)
  })

  test('describes a model models.dev does not know from the catalog alone', async () => {
    serveCatalog([catalogEntry('gpt-7', { input_modalities: ['text'] })])
    const provider = await load(oauth({ accountId: 'acct_unknown' }))

    const model = provider.models['gpt-7']
    expect(model.name).toBe('GPT-7')
    expect(model.api).toEqual({
      id: 'gpt-7',
      url: 'https://chatgpt.com/backend-api/codex',
      npm: '@ai-sdk/openai',
    })
    expect(model.capabilities.reasoning).toBe(true)
    expect(model.capabilities.input.image).toBe(false)
    expect(model.capabilities.toolcall).toBe(true)
  })

  test('asks the catalog with the account headers', async () => {
    serveCatalog([catalogEntry('gpt-6-sol')])
    await loadOpenaiProviderWithAuth(
      oauth({ accountId: 'acct_headers' }),
      openaiProvider(),
    )

    expect(captured).toHaveLength(1)
    expect(captured[0].url).toBe(CATALOG_URL)
    expect(captured[0].headers.get('authorization')).toBe('Bearer access-token')
    expect(captured[0].headers.get('chatgpt-account-id')).toBe('acct_headers')
  })

  test('reuses the catalog for the same account instead of asking again', async () => {
    serveCatalog([catalogEntry('gpt-6-sol')])
    const auth = oauth({ accountId: 'acct_cached' })
    await loadOpenaiProviderWithAuth(auth, openaiProvider())
    await loadOpenaiProviderWithAuth(auth, openaiProvider())

    expect(captured.filter((c) => c.url === CATALOG_URL)).toHaveLength(1)
  })

  test('falls back to the models.dev list when the catalog cannot be fetched', async () => {
    respond = () => new Response('{"detail":"Unauthorized"}', { status: 401 })
    const provider = await load(oauth({ accountId: 'acct_failing' }))

    expect(Object.keys(provider.models)).toEqual(['gpt-6-sol'])
    expect(provider.models['gpt-6-sol'].api.url).toBe(
      'https://chatgpt.com/backend-api/codex',
    )
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
