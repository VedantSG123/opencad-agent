import * as fs from 'fs'
import * as path from 'path'

import type { UserPreferences, UserPreferencesPatch } from 'shared'
import {
  CACHE_DIR,
  DEFAULT_USER_PREFERENCES,
  mergeUserPreferences,
  parseUserPreferences,
} from 'shared'

const PREFERENCES_PATH = path.join(CACHE_DIR, 'preferences.json')

function readPreferencesFile(): UserPreferences {
  try {
    const raw = fs.readFileSync(PREFERENCES_PATH, 'utf-8')
    return parseUserPreferences(JSON.parse(raw))
  } catch {
    return DEFAULT_USER_PREFERENCES
  }
}

let cachedPreferences: UserPreferences = readPreferencesFile()

export function getPreferences(): UserPreferences {
  return cachedPreferences
}

export function updatePreferences(
  patch: UserPreferencesPatch,
): UserPreferences {
  cachedPreferences = mergeUserPreferences(cachedPreferences, patch)
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(
    PREFERENCES_PATH,
    JSON.stringify(cachedPreferences, null, 2),
    'utf-8',
  )
  return cachedPreferences
}
