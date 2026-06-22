import type { IpcMain } from 'electron'

import { createHandler, validateString } from '../utils/ipc-utils.js'
import { startWatching } from '../utils/watcher.js'
import {
  addAllowedRoot,
  getAllowedRootsCount,
  loadAllowedWorkspaceRoots,
  validatePath,
} from '../utils/workspace.js'

export function registerWorkspaceIpc(ipcMain: IpcMain, backendPort: number) {
  ipcMain.handle(
    'workspace:watch',
    createHandler(async (dirPath: string) => {
      validateString(dirPath, 'dirPath')
      const validated = validatePath(dirPath)
      await startWatching(validated)
    }),
  )

  ipcMain.handle(
    'projects:refresh-roots',
    createHandler(async () => {
      await loadAllowedWorkspaceRoots(`http://127.0.0.1:${backendPort}`)
      return { count: getAllowedRootsCount() }
    }),
  )

  ipcMain.handle(
    'projects:add-root',
    createHandler((directory: string) => {
      validateString(directory, 'directory')
      addAllowedRoot(directory)
      console.log(`Added allowed workspace root: ${directory}`)
      return { count: getAllowedRootsCount() }
    }),
  )
}
