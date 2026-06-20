import type { IpcMain } from 'electron'

import { getOpenSCADWorker } from '../utils/cad/openscad-worker.js'
import { createHandler } from '../utils/ipc-utils.js'
import { validatePath } from '../utils/workspace.js'

export function registerOpenSCADIpc(ipcMain: IpcMain) {
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
        const api = getOpenSCADWorker()
        return await api.compile(main, overrides, validatedProjDir, vars)
      },
    ),
  )

  ipcMain.handle(
    'openscad:exportSTL',
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
        const api = getOpenSCADWorker()
        return await api.exportSTL(main, overrides, validatedProjDir, vars)
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
        const api = getOpenSCADWorker()
        return await api.checkSyntax(main, overrides, validatedProjDir)
      },
    ),
  )
}
