import path from 'node:path'

import type { IpcMain, WebContents } from 'electron'
import { openSCADBuildRequestSchema } from 'shared'

import { buildOpenSCAD, executeOpenSCAD } from '../utils/cad/openscad/run.js'
import { AppError, createHandler } from '../utils/ipc-utils.js'
import { validatePath } from '../utils/workspace.js'

export function registerOpenSCADIpc(ipcMain: IpcMain) {
  const owners = new WeakMap<WebContents, Set<AbortController>>()
  ipcMain.handle('openscad:build', (event, input: unknown) =>
    createHandler(async () => {
      const request = openSCADBuildRequestSchema.parse(input)
      const projectDirectory = validatePath(request.projectDirectory)
      const file = request.file.replaceAll('\\', '/')
      const absolute = path.resolve(projectDirectory, file)
      const relative = path.relative(projectDirectory, absolute)
      if (
        path.isAbsolute(file) ||
        path.win32.isAbsolute(file) ||
        relative === '' ||
        relative === '..' ||
        relative.startsWith('..' + path.sep) ||
        path.isAbsolute(relative)
      ) {
        throw new AppError(
          'ACCESS_DENIED',
          'The build file must belong to this project.',
        )
      }
      validatePath(absolute)
      const owner = event.sender
      let active = owners.get(owner)
      if (!active) {
        active = new Set()
        owners.set(owner, active)
        const cancel = () => {
          for (const controller of owners.get(owner) ?? [])
            controller.abort(
              new Error('The build window closed or navigated away.'),
            )
        }
        owner.once('destroyed', cancel)
        owner.on('render-process-gone', cancel)
        owner.on(
          'did-start-navigation',
          (_event, _url, _inPlace, isMainFrame) => {
            if (isMainFrame) cancel()
          },
        )
      }
      const controller = new AbortController()
      active.add(controller)
      try {
        return await buildOpenSCAD(
          {
            ...request,
            projectDirectory,
            file: relative.split(path.sep).join('/'),
          },
          controller.signal,
        )
      } finally {
        active.delete(controller)
      }
    })(event),
  )

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
