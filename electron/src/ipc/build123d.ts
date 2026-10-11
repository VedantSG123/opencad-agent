import type { IpcMain } from 'electron'
import type { Build123dExportFormat } from 'shared/build123d'
import { BUILD123D_EXPORT_FORMATS } from 'shared/build123d'

import type { Build123dRunRequest } from '../utils/cad/build123d/run.js'
import {
  cancelBuild123dRun,
  exportBuild123d,
  runBuild123dProject,
  runBuild123dSource,
} from '../utils/cad/build123d/run.js'
import { AppError, createHandler, validateString } from '../utils/ipc-utils.js'
import { validatePath } from '../utils/workspace.js'

/**
 * Check every path the renderer named against the workspace sandbox.
 *
 * Each override is checked in its own right rather than trusted because the
 * main file passed, and building and exporting share this so that one of them
 * cannot end up the lenient way in.
 */
function validateRunRequest(request: Build123dRunRequest): Build123dRunRequest {
  const overrides: Record<string, string> = {}
  for (const [filePath, content] of Object.entries(request.overrides ?? {})) {
    if (typeof content !== 'string') {
      throw new AppError('INVALID_INPUT', `${filePath} has no content`)
    }
    overrides[validatePath(filePath)] = content
  }

  return {
    mainPath: validatePath(validateString(request.mainPath, 'mainPath')),
    projectDirectory: validatePath(
      validateString(request.projectDirectory, 'projectDirectory'),
    ),
    overrides,
  }
}

export function registerBuild123dIpc(ipcMain: IpcMain) {
  ipcMain.handle(
    'build123d:run',
    createHandler((request: Build123dRunRequest) =>
      runBuild123dProject(validateRunRequest(request)),
    ),
  )

  ipcMain.handle(
    'build123d:export',
    createHandler(
      (request: Build123dRunRequest & { format: Build123dExportFormat }) => {
        if (!BUILD123D_EXPORT_FORMATS.includes(request.format)) {
          throw new AppError(
            'INVALID_INPUT',
            `Unsupported export format: ${String(request.format)}`,
          )
        }

        return exportBuild123d({
          ...validateRunRequest(request),
          format: request.format,
        })
      },
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
