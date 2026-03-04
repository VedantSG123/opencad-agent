import z from 'zod'

import { createLazyStore } from '../utils/lazyStore'
import { DATA_DIR } from '../utils/storageDirectories'

export const OAuth = z.object({
  type: z.literal('oauth'),
  refresh: z.string(),
  access: z.string(),
  expires: z.number(),
})

export const APIKey = z.object({
  type: z.literal('api_key'),
  keys: z.record(z.string(), z.string()),
})

export const Auth = z.discriminatedUnion('type', [OAuth, APIKey])

export type Auth = z.infer<typeof Auth>

const AUTH_FILE = `${DATA_DIR}/auth.json`

async function loadFromFile(): Promise<Record<string, Auth>> {
  const data: unknown = await Bun.file(AUTH_FILE)
    .json()
    .catch(() => ({}))
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
  await _persist(state)
}

export async function remove(key: string) {
  const state = await store.get()
  delete state[key]
  await _persist(state)
}
