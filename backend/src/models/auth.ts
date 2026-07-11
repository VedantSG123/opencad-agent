import z from 'zod'

import { DATA_DIR } from '../utils/directories'
import { createLazyStore } from '../utils/lazyStore'

export const OAuth = z.object({
  type: z.literal('oauth'),
  refresh: z.string(),
  access: z.string(),
  expires: z.number(),
  accountId: z.string().optional(),
})

export const APIKey = z.object({
  type: z.literal('api_key'),
  keys: z.record(z.string(), z.string()),
})

export const Auth = z.discriminatedUnion('type', [OAuth, APIKey])

export type Auth = z.infer<typeof Auth>

const AUTH_FILE = `${DATA_DIR}/auth.json`

const INTERNAL_PORT = process.env.ELECTRON_INTERNAL_PORT
const SECRET = process.env.ELECTRON_SECRET
const isElectronMode = !!(INTERNAL_PORT && SECRET)

async function fetchFromElectron(
  path: string,
  method: string = 'GET',
  body?: unknown,
): Promise<unknown> {
  try {
    const res = await fetch(`http://127.0.0.1:${INTERNAL_PORT}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${SECRET}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      console.error(
        `Electron loopback API returned HTTP ${res.status} for ${method} ${path}`,
      )
      return null
    }
    return await res.json()
  } catch (e) {
    console.error(
      `Failed to communicate with Electron loopback server for ${method} ${path}:`,
      e,
    )
    return null
  }
}

async function loadFromFile(): Promise<Record<string, Auth>> {
  let data: unknown
  if (isElectronMode) {
    data = await fetchFromElectron('/credentials')
  } else {
    data = await Bun.file(AUTH_FILE)
      .json()
      .catch(() => ({}))
  }

  const entries =
    typeof data === 'object' && data !== null
      ? Object.entries(data as Record<string, unknown>)
      : []

  return entries.reduce(
    (acc, [key, value]) => {
      const parsed = Auth.safeParse(value)
      if (parsed.success) acc[key] = parsed.data
      return acc
    },
    {} as Record<string, Auth>,
  )
}

const store = createLazyStore(loadFromFile)

export const all = () => store.get()

async function _persist(state: Record<string, Auth>) {
  await Bun.write(AUTH_FILE, JSON.stringify(state, null, 2))
}

export async function set(key: string, auth: Auth) {
  const state = await store.get()
  state[key] = auth

  if (isElectronMode) {
    await fetchFromElectron('/set-credential', 'POST', {
      providerId: key,
      auth,
    })
  } else {
    await _persist(state)
  }

  // Invalidate provider cache dynamically to avoid circular dependency
  const { invalidateProviderCache } = await import('./providers')
  invalidateProviderCache()
}

export async function remove(key: string) {
  const state = await store.get()
  delete state[key]

  if (isElectronMode) {
    await fetchFromElectron('/remove-credential', 'POST', { providerId: key })
  } else {
    await _persist(state)
  }

  // Invalidate provider cache dynamically to avoid circular dependency
  const { invalidateProviderCache } = await import('./providers')
  invalidateProviderCache()
}
