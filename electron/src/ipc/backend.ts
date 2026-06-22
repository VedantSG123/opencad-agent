import type { IpcMain } from 'electron'

import { AppError, createHandler } from '../utils/ipc-utils.js'

export function registerBackendIpc(ipcMain: IpcMain, backendPort: number) {
  ipcMain.handle(
    'backend:ping',
    createHandler(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${backendPort}/`)
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const text = await res.text()
        return `Main Process Response: SUCCESS (Elysia Backend says: "${text}")`
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        throw new AppError(
          'PING_FAILED',
          `Main Process Response: FAILED (Could not connect to Elysia on port ${backendPort}. Error: ${msg})`,
        )
      }
    }),
  )
}
