import type { IpcMain } from 'electron'
import { shell } from 'electron'

import { createHandler, validateString } from '../utils/ipc-utils.js'

export function registerShellIpc(ipcMain: IpcMain) {
  ipcMain.handle(
    'shell:open-external',
    createHandler(async (url: string) => {
      validateString(url, 'url')
      await shell.openExternal(url)
    }),
  )
}
