import type { IpcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

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
      await fs.promises.mkdir(path.dirname(validated), { recursive: true })
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

  ipcMain.handle(
    'fs:rename',
    createHandler(async (oldPath: string, newPath: string) => {
      validateString(oldPath, 'oldPath')
      validateString(newPath, 'newPath')
      const validatedOld = validatePath(oldPath)
      const validatedNew = validatePath(newPath)

      // Prevent silent overwrite — check destination doesn't already exist
      try {
        await fs.promises.access(validatedNew, fs.constants.F_OK)
        throw new AppError(
          'FILE_EXISTS',
          `A file or folder named "${path.basename(validatedNew)}" already exists at this location`,
        )
      } catch (err: unknown) {
        if (err instanceof AppError) throw err
        // ENOENT means destination is free — good
      }

      // Case-only rename on same directory (e.g., Foo.js -> foo.js)
      // `fs.rename` is a no-op when source and dest differ only by case on macOS/Windows.
      const oldDir = path.dirname(validatedOld)
      const newDir = path.dirname(validatedNew)
      const oldBase = path.basename(validatedOld)
      const newBase = path.basename(validatedNew)
      const isCaseOnly =
        oldDir === newDir && oldBase.toLowerCase() === newBase.toLowerCase()

      try {
        await fs.promises.rename(validatedOld, validatedNew)
      } catch (err: unknown) {
        const nodeErr = err as NodeJS.ErrnoException
        // EXDEV — cross-device link, fall back to copy + delete
        if (nodeErr.code === 'EXDEV') {
          await fs.promises.cp(validatedOld, validatedNew, {
            recursive: true,
            force: false,
            errorOnExist: true,
          })
          await fs.promises.rm(validatedOld, { recursive: true, force: true })
          return
        }
        if (isCaseOnly && nodeErr.code === 'ENOENT') {
          // On some systems, rename is no-op for case-only; force via copy+delete
          await fs.promises.cp(validatedOld, validatedNew, {
            recursive: true,
            force: false,
            errorOnExist: true,
          })
          await fs.promises.rm(validatedOld, { recursive: true, force: true })
          return
        }
        throw err
      }
    }),
  )

  ipcMain.handle(
    'fs:exists',
    createHandler(async (filePath: string) => {
      validateString(filePath, 'filePath')
      const validated = validatePath(filePath)
      try {
        await fs.promises.access(validated, fs.constants.F_OK)
        return true
      } catch {
        return false
      }
    }),
  )
}
