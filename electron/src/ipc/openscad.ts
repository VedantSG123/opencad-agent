import type { IpcMain } from 'electron'

import { executeOpenSCAD } from '../utils/cad/openscad-worker.js'
import { createHandler } from '../utils/ipc-utils.js'
import { validatePath } from '../utils/workspace.js'

export function registerOpenSCADIpc(ipcMain: IpcMain) {
  ipcMain.handle(
    'openscad:execute',
    createHandler(
      async (request: {
        action: 'compile' | 'export' | 'checkSyntax'
        main: { path: string; code: string }
        overrides?: Record<string, { content: string }>
        projectDirectory?: string
        vars?: Record<string, unknown>
        format?: string
      }) => {
        const validatedProjDir = request.projectDirectory
          ? validatePath(request.projectDirectory)
          : undefined
        return await executeOpenSCAD({
          ...request,
          projectDirectory: validatedProjDir,
        })
      },
    ),
  )

  ipcMain.handle(
    'openscad:compile',
    createHandler(
      async (
        main: { path: string; code: string },
        overrides?: Record<string, { content: string }>,
        projectDirectory?: string,
        vars?: Record<string, unknown>,
      ) => {
        const validatedProjDir = projectDirectory
          ? validatePath(projectDirectory)
          : undefined
        return await executeOpenSCAD({
          action: 'compile',
          main,
          overrides,
          projectDirectory: validatedProjDir,
          vars,
        })
      },
    ),
  )

  ipcMain.handle(
    'openscad:export',
    createHandler(
      async (
        main: { path: string; code: string },
        format: string,
        overrides?: Record<string, { content: string }>,
        projectDirectory?: string,
        vars?: Record<string, unknown>,
      ) => {
        const validatedProjDir = projectDirectory
          ? validatePath(projectDirectory)
          : undefined
        return await executeOpenSCAD({
          action: 'export',
          format,
          main,
          overrides,
          projectDirectory: validatedProjDir,
          vars,
        })
      },
    ),
  )

  ipcMain.handle(
    'openscad:checkSyntax',
    createHandler(
      async (
        main: { path: string; code: string },
        overrides?: Record<string, { content: string }>,
        projectDirectory?: string,
      ) => {
        const validatedProjDir = projectDirectory
          ? validatePath(projectDirectory)
          : undefined
        return await executeOpenSCAD({
          action: 'checkSyntax',
          main,
          overrides,
          projectDirectory: validatedProjDir,
        })
      },
    ),
  )
}
