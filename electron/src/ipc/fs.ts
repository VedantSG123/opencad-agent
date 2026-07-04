import type { IpcMain } from 'electron'
import * as fs from 'fs'

import { AppError, createHandler, validateString } from '../utils/ipc-utils.js'
import { validatePath } from '../utils/workspace.js'

export function registerFsIpc(ipcMain: IpcMain) {
  ipcMain.handle(
    'fs:read',
    createHandler(async (filePath: string) => {
      validateString(filePath, 'filePath')
      const validated = validatePath(filePath)
      return await fs.promises.readFile(validated, 'utf-8')
    }),
  )

  ipcMain.handle(
    'fs:write',
    createHandler(async (filePath: string, content: string) => {
      validateString(filePath, 'filePath')
      if (typeof content !== 'string') {
        throw new AppError('INVALID_INPUT', 'content must be a string')
      }
      const validated = validatePath(filePath)
      await fs.promises.writeFile(validated, content, 'utf-8')
    }),
  )

  ipcMain.handle(
    'fs:readdir',
    createHandler(async (dirPath: string) => {
      validateString(dirPath, 'dirPath')
      const validated = validatePath(dirPath)
      return await fs.promises.readdir(validated)
    }),
  )

  ipcMain.handle(
    'fs:readdirWithTypes',
    createHandler(async (dirPath: string) => {
      validateString(dirPath, 'dirPath')
      const validated = validatePath(dirPath)
      const entries = await fs.promises.readdir(validated, {
        withFileTypes: true,
      })
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      }))
    }),
  )

  ipcMain.handle(
    'fs:mkdir',
    createHandler(async (dirPath: string) => {
      validateString(dirPath, 'dirPath')
      const validated = validatePath(dirPath)
      await fs.promises.mkdir(validated, { recursive: true })
    }),
  )

  ipcMain.handle(
    'fs:delete',
    createHandler(async (filePath: string) => {
      validateString(filePath, 'filePath')
      const validated = validatePath(filePath)
      await fs.promises.rm(validated, { recursive: true, force: true })
    }),
  )
}
