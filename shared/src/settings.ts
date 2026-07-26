import { z } from 'zod'

export const themeSettingSchema = z.enum(['light', 'dark', 'system'])
export type ThemeSetting = z.infer<typeof themeSettingSchema>

// The OS/native-theme-resolved appearance — never persisted, only ever
// computed from a ThemeSetting (a ThemeSetting of 'system' resolves to
// whichever of these matches the current OS preference).
export type ResolvedTheme = 'light' | 'dark'

export const appearanceSettingsSchema = z.object({
  theme: themeSettingSchema.default('system'),
})
export type AppearanceSettings = z.infer<typeof appearanceSettingsSchema>

// Root of the persisted settings file. Add further sections (e.g. editor,
// workspace) as sibling keys alongside `appearance` as they're needed.
export const appSettingsSchema = z.object({
  appearance: appearanceSettingsSchema.default({ theme: 'system' }),
})
export type AppSettings = z.infer<typeof appSettingsSchema>

export const appSettingsPatchSchema = z.object({
  appearance: appearanceSettingsSchema.partial().optional(),
})
export type AppSettingsPatch = z.infer<typeof appSettingsPatchSchema>

export const DEFAULT_APP_SETTINGS: AppSettings = appSettingsSchema.parse({})

export function parseAppSettings(raw: unknown): AppSettings {
  return appSettingsSchema.parse(raw ?? {})
}

export function mergeAppSettings(
  current: AppSettings,
  patch: AppSettingsPatch,
): AppSettings {
  return {
    ...current,
    ...patch,
    appearance: { ...current.appearance, ...patch.appearance },
  }
}
