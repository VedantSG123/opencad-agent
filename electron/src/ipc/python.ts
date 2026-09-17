import type { BrowserWindow, IpcMain } from 'electron'
import type { PythonEnvStatus, PythonInstallProgress } from 'shared/python'

import { createHandler, validateString } from '../utils/ipc-utils.js'
import {
  cancelPythonInstall,
  getRunningInstall,
  installPythonEnv,
  repairPythonEnv,
} from '../utils/python/install.js'
import { setCustomInterpreter } from '../utils/python/interpreter.js'
import { getPythonStatus } from '../utils/python/status.js'

export function registerPythonIpc(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
) {
  const emit = (progress: PythonInstallProgress) => {
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('python:progress', progress)
    }
  }

  ipcMain.handle(
    'python:status',
    createHandler(async (): Promise<PythonEnvStatus> => {
      // An install in flight is the one state probing cannot discover, since
      // the environment it is asked about is still being built.
      const inFlight = getRunningInstall()
      return inFlight
        ? { state: 'installing', step: inFlight.step }
        : await getPythonStatus()
    }),
  )

  ipcMain.handle(
    'python:install',
    createHandler(() => installPythonEnv(emit)),
  )

  ipcMain.handle(
    'python:repair',
    createHandler(() => repairPythonEnv(emit)),
  )

  ipcMain.handle(
    'python:cancel',
    createHandler(() => cancelPythonInstall()),
  )

  ipcMain.handle(
    'python:setInterpreter',
    createHandler((interpreter: string | null) =>
      setCustomInterpreter(
        interpreter === null
          ? null
          : validateString(interpreter, 'interpreter'),
      ),
    ),
  )
}
