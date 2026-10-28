import path from 'node:path'

import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron'
import type {
  Build123dCancelRequest,
  Build123dExportFormat,
  Build123dProjectRequest,
  Build123dRunIdentity,
  Build123dSourceRequest,
} from 'shared/build123d'
import { BUILD123D_EXPORT_FORMATS } from 'shared/build123d'

import {
  cancelBuild123dOwner,
  cancelBuild123dRun,
  exportBuild123d,
  runBuild123dProject,
  runBuild123dSource,
} from '../utils/cad/build123d/run.js'
import { AppError, createHandler, validateString } from '../utils/ipc-utils.js'
import { validatePath } from '../utils/workspace.js'

function validateIdentity(request: Build123dRunIdentity): Build123dRunIdentity {
  return {
    sessionId: validateString(request.sessionId, 'sessionId'),
    runId: validateString(request.runId, 'runId'),
  }
}

function projectPath(projectDirectory: string, filePath: string): string {
  const resolved = validatePath(filePath)
  const relative = path.relative(projectDirectory, resolved)
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new AppError(
      'ACCESS_DENIED',
      'Build files must belong to this project.',
    )
  }
  return resolved
}

function validateRunRequest(
  request: Build123dProjectRequest,
): Build123dProjectRequest {
  const projectDirectory = validatePath(
    validateString(request.projectDirectory, 'projectDirectory'),
  )
  const overrides: Record<string, string> = {}
  for (const [filePath, content] of Object.entries(request.overrides ?? {})) {
    if (typeof content !== 'string') {
      throw new AppError('INVALID_INPUT', `${filePath} has no content`)
    }
    overrides[projectPath(projectDirectory, filePath)] = content
  }
  return {
    ...validateIdentity(request),
    mainPath: projectPath(
      projectDirectory,
      validateString(request.mainPath, 'mainPath'),
    ),
    projectDirectory,
    overrides,
  }
}

const watchedOwners = new WeakSet<WebContents>()

function ownedHandler<T, R>(
  execute: (request: T, ownerId: number) => R | Promise<R>,
) {
  return (event: IpcMainInvokeEvent, request: T) => {
    const sender = event.sender
    const ownerId = sender.id
    if (!watchedOwners.has(sender)) {
      watchedOwners.add(sender)
      sender.once('destroyed', () => cancelBuild123dOwner(ownerId))
      sender.on('render-process-gone', () => cancelBuild123dOwner(ownerId))
      sender.on(
        'did-start-navigation',
        (_event, _url, _inPlace, isMainFrame) => {
          if (isMainFrame) cancelBuild123dOwner(ownerId)
        },
      )
    }
    return createHandler((input: T) => execute(input, ownerId))(event, request)
  }
}

export function registerBuild123dIpc(ipcMain: IpcMain) {
  ipcMain.handle(
    'build123d:run',
    ownedHandler((request: Build123dProjectRequest, ownerId) =>
      runBuild123dProject(validateRunRequest(request), ownerId),
    ),
  )
  ipcMain.handle(
    'build123d:export',
    ownedHandler(
      (
        request: Build123dProjectRequest & { format: Build123dExportFormat },
        ownerId,
      ) => {
        if (!BUILD123D_EXPORT_FORMATS.includes(request.format)) {
          throw new AppError(
            'INVALID_INPUT',
            `Unsupported export format: ${String(request.format)}`,
          )
        }
        return exportBuild123d(
          { ...validateRunRequest(request), format: request.format },
          ownerId,
        )
      },
    ),
  )
  ipcMain.handle(
    'build123d:runSource',
    ownedHandler((request: Build123dSourceRequest, ownerId) =>
      runBuild123dSource(
        {
          ...validateIdentity(request),
          source: validateString(request.source, 'source'),
        },
        ownerId,
      ),
    ),
  )
  ipcMain.handle(
    'build123d:cancel',
    ownedHandler((request: Build123dCancelRequest, ownerId) =>
      cancelBuild123dRun(
        {
          sessionId: validateString(request.sessionId, 'sessionId'),
          ...(request.runId === undefined
            ? {}
            : { runId: validateString(request.runId, 'runId') }),
        },
        ownerId,
      ),
    ),
  )
}
