import type { IpcMain } from 'electron'

import type { Build123dRunRequest } from '../utils/cad/build123d/run.js'
import {
  cancelBuild123dRun,
  runBuild123dProject,
  runBuild123dSource,
} from '../utils/cad/build123d/run.js'
import { AppError, createHandler, validateString } from '../utils/ipc-utils.js'
import { validatePath } from '../utils/workspace.js'

export function registerBuild123dIpc(ipcMain: IpcMain) {
  ipcMain.handle(
    'build123d:run',
    createHandler((request: Build123dRunRequest) => {
      const mainPath = validatePath(
        validateString(request.mainPath, 'mainPath'),
      )
      const projectDirectory = validatePath(
        validateString(request.projectDirectory, 'projectDirectory'),
      )

      // Each override is a path the renderer named, so each is checked against
      // the sandbox rather than trusted because the main file passed.
      const overrides: Record<string, string> = {}
      for (const [filePath, content] of Object.entries(
        request.overrides ?? {},
      )) {
        if (typeof content !== 'string') {
          throw new AppError('INVALID_INPUT', `${filePath} has no content`)
        }
        overrides[validatePath(filePath)] = content
      }

      return runBuild123dProject({ mainPath, projectDirectory, overrides })
    }),
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
