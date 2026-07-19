import type { BrowserWindow, IpcMain } from 'electron'
import { nativeTheme } from 'electron'
import type { ThemeSetting } from 'shared'
import { themeSettingSchema } from 'shared'

import { AppError, createHandler } from '../utils/ipc-utils.js'
import { getSettings, updateSettings } from '../utils/settings.js'
import { getResolvedTheme, getTitleBarOverlay } from '../utils/theme.js'

function applyTitleBarOverlay(mainWindow: BrowserWindow | null) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    process.platform === 'darwin'
  ) {
    return
  }
  mainWindow.setTitleBarOverlay(getTitleBarOverlay(getResolvedTheme()))
}

export function registerSettingsIpc(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
) {
  ipcMain.handle(
    'settings:get',
    createHandler(() => getSettings()),
  )

  ipcMain.handle(
    'theme:set',
    createHandler((theme: ThemeSetting) => {
      const parsed = themeSettingSchema.safeParse(theme)
      if (!parsed.success) {
        throw new AppError(
          'INVALID_INPUT',
          "theme must be one of 'light', 'dark', 'system'",
        )
      }
      updateSettings({ appearance: { theme: parsed.data } })
      nativeTheme.themeSource = parsed.data
      applyTitleBarOverlay(getMainWindow())
      return getResolvedTheme()
    }),
  )

  // Fires when the effective (resolved) theme changes: either the OS theme
  // changed while themeSource is 'system', or themeSource was just switched
  // to a value that resolves differently. Keeps the titlebar and renderer in
  // sync with the OS in the 'system' case.
  nativeTheme.on('updated', () => {
    const resolved = getResolvedTheme()
    const mainWindow = getMainWindow()
    applyTitleBarOverlay(mainWindow)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('theme:updated', resolved)
    }
  })
}
