import type { IpcMain } from 'electron'

import {
  cancelBuild123dRun,
  runBuild123d,
  runBuild123dSource,
} from '../utils/cad/build123d/run.js'
import { createHandler, validateString } from '../utils/ipc-utils.js'
import { validatePath } from '../utils/workspace.js'

export function registerBuild123dIpc(ipcMain: IpcMain) {
  ipcMain.handle(
    'build123d:run',
    createHandler((scriptPath: string) =>
      runBuild123d(validatePath(validateString(scriptPath, 'scriptPath'))),
    ),
  )

  ipcMain.handle(
    'build123d:runSource',
    createHandler((source: string) =>
      runBuild123dSource(validateString(source, 'source')),
    ),
  )

  ipcMain.handle(
    'build123d:cancel',
    createHandler(() => cancelBuild123dRun()),
  )
}
