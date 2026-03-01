import z from 'zod'
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

export async function all(): Promise<Record<string, Auth>> {
  const file = Bun.file(AUTH_FILE)
  const data = await file.json().catch(() => ({}))

  return Object.entries(data).reduce(
    (acc, [key, value]) => {
      const parsed = Auth.safeParse(value)
      if (parsed.success) {
        acc[key] = parsed.data
      }
      return acc
    },
    {} as Record<string, Auth>,
  )
}

export async function add(key: string, auth: Auth) {
  const allAuth = await all()
  allAuth[key] = auth
  await Bun.write(AUTH_FILE, JSON.stringify(allAuth, null, 2))
}

export async function remove(key: string) {
  const allAuth = await all()
  delete allAuth[key]
  await Bun.write(AUTH_FILE, JSON.stringify(allAuth, null, 2))
}
