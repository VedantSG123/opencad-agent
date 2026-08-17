import { z } from 'zod'

export const permissionAccessSchema = z.enum(['read', 'write'])
export type PermissionAccess = z.infer<typeof permissionAccessSchema>

export const permissionMatchSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('pathPrefix'),
    path: z.string(),
    access: permissionAccessSchema,
  }),
  z.object({
    kind: z.literal('commandHead'),
    tokens: z.array(z.string()).min(1),
  }),
  z.object({
    kind: z.literal('commandExact'),
    command: z.string(),
  }),
])
export type PermissionMatch = z.infer<typeof permissionMatchSchema>

export const permissionRuleSchema = z.object({
  id: z.string(),
  /** Tool name the rule applies to, or `*` for every tool. */
  tool: z.string(),
  match: permissionMatchSchema,
  decision: z.enum(['allow', 'deny']),
  createdAt: z.string(),
})
export type PermissionRule = z.infer<typeof permissionRuleSchema>

export const permissionPreferencesSchema = z.object({
  rules: z.array(permissionRuleSchema).default([]),
})
export type PermissionPreferences = z.infer<typeof permissionPreferencesSchema>

// Root of the per-project preferences column. Add further sections as sibling
// keys alongside `permissions` as they're needed.
export const projectPreferencesSchema = z.object({
  permissions: permissionPreferencesSchema.default({ rules: [] }),
})
export type ProjectPreferences = z.infer<typeof projectPreferencesSchema>

export const projectPreferencesPatchSchema = z.object({
  permissions: permissionPreferencesSchema.partial().optional(),
})
export type ProjectPreferencesPatch = z.infer<
  typeof projectPreferencesPatchSchema
>

export const DEFAULT_PROJECT_PREFERENCES: ProjectPreferences =
  projectPreferencesSchema.parse({})

/**
 * Falls back to defaults rather than throwing, and drops the whole set rather
 * than salvaging what parses: unreadable permissions must cost the user a
 * second approval, never grant one that was not written by this app.
 */
export function parseProjectPreferences(raw: unknown): ProjectPreferences {
  const parsed = projectPreferencesSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : DEFAULT_PROJECT_PREFERENCES
}

export function mergeProjectPreferences(
  current: ProjectPreferences,
  patch: ProjectPreferencesPatch,
): ProjectPreferences {
  return {
    ...current,
    ...patch,
    permissions: { ...current.permissions, ...patch.permissions },
  }
}
