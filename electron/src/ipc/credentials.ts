import type { IpcMain } from 'electron'
import { safeStorage } from 'electron'

import { createHandler } from '../utils/ipc-utils.js'
import { storeCredentialInVault, type VaultAuth } from '../utils/vault.js'

export function registerCredentialsIpc(ipcMain: IpcMain) {
  ipcMain.handle(
    'credentials:store',
    createHandler((providerId: string, auth: VaultAuth) => {
      storeCredentialInVault(providerId, auth)
    }),
  )

  ipcMain.handle(
    'credentials:is-encryption-available',
    createHandler(() => {
      return safeStorage.isEncryptionAvailable()
    }),
  )
}
