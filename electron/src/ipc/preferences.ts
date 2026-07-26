import type { IpcMain } from 'electron'
import type { UserPreferencesPatch } from 'shared'
import { userPreferencesPatchSchema } from 'shared'

import { AppError, createHandler } from '../utils/ipc-utils.js'
import { getPreferences, updatePreferences } from '../utils/preferences.js'

export function registerPreferencesIpc(ipcMain: IpcMain) {
  ipcMain.handle(
    'preferences:get',
    createHandler(() => getPreferences()),
  )

  ipcMain.handle(
    'preferences:update',
    createHandler((patch: UserPreferencesPatch) => {
      const parsed = userPreferencesPatchSchema.safeParse(patch)
      if (!parsed.success) {
        throw new AppError('INVALID_INPUT', 'Invalid preferences patch')
      }
      return updatePreferences(parsed.data)
    }),
  )
}
