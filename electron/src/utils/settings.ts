import * as fs from 'fs'
import * as path from 'path'

import type { AppSettings, AppSettingsPatch } from 'shared'
import {
  CONFIG_DIR,
  DEFAULT_APP_SETTINGS,
  mergeAppSettings,
  parseAppSettings,
} from 'shared'

const SETTINGS_PATH = path.join(CONFIG_DIR, 'settings.json')

function readSettingsFile(): AppSettings {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8')
    return parseAppSettings(JSON.parse(raw))
  } catch {
    return DEFAULT_APP_SETTINGS
  }
}

let cachedSettings: AppSettings = readSettingsFile()

export function getSettings(): AppSettings {
  return cachedSettings
}

export function updateSettings(patch: AppSettingsPatch): AppSettings {
  cachedSettings = mergeAppSettings(cachedSettings, patch)
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(
    SETTINGS_PATH,
    JSON.stringify(cachedSettings, null, 2),
    'utf-8',
  )
  return cachedSettings
}
