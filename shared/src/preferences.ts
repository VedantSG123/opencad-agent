import { z } from 'zod'

export const lastUsedModelSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
})
export type LastUsedModel = z.infer<typeof lastUsedModelSchema>

// Root of the persisted user-preferences cache file. Add further optional
// sections as sibling keys alongside `lastUsedModel` as they're needed.
export const userPreferencesSchema = z.object({
  lastUsedModel: lastUsedModelSchema.optional(),
})
export type UserPreferences = z.infer<typeof userPreferencesSchema>

export const userPreferencesPatchSchema = userPreferencesSchema.partial()
export type UserPreferencesPatch = z.infer<typeof userPreferencesPatchSchema>

export const DEFAULT_USER_PREFERENCES: UserPreferences =
  userPreferencesSchema.parse({})

export function parseUserPreferences(raw: unknown): UserPreferences {
  return userPreferencesSchema.parse(raw ?? {})
}

export function mergeUserPreferences(
  current: UserPreferences,
  patch: UserPreferencesPatch,
): UserPreferences {
  return { ...current, ...patch }
}
