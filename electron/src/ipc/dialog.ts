import type { IpcMain } from 'electron'
import { dialog } from 'electron'
import * as path from 'path'

import { AppError, createHandler, validateObject } from '../utils/ipc-utils.js'
import { addAllowedRoot } from '../utils/workspace.js'

export function registerDialogIpc(ipcMain: IpcMain) {
  ipcMain.handle(
    'dialog:open',
    createHandler(
      async (options: { mode: 'file' | 'directory'; extension?: string }) => {
        validateObject(options, 'options')
        if (options.mode !== 'file' && options.mode !== 'directory') {
          throw new AppError(
            'INVALID_INPUT',
            "options.mode must be 'file' or 'directory'",
          )
        }
        if (
          options.extension !== undefined &&
          typeof options.extension !== 'string'
        ) {
          throw new AppError(
            'INVALID_INPUT',
            'options.extension must be a string',
          )
        }

        const isFile = options.mode === 'file'
        const properties: ('openFile' | 'openDirectory')[] = isFile
          ? ['openFile']
          : ['openDirectory']

        const result = await dialog.showOpenDialog({
          properties,
          filters:
            isFile && options.extension
              ? [{ name: 'CAD Files', extensions: [options.extension] }]
              : undefined,
        })

        if (!result.canceled && result.filePaths.length > 0) {
          for (const filePath of result.filePaths) {
            const allowedPath =
              options.mode === 'directory' ? filePath : path.dirname(filePath)
            addAllowedRoot(allowedPath)
            console.log(`Added allowed path to sandbox: ${allowedPath}`)
          }
        }

        return {
          canceled: result.canceled,
          filePaths: result.filePaths,
        }
      },
    ),
  )
}
