import * as crypto from 'crypto'
import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as http from 'http'
import * as path from 'path'

import { findFreePort } from './network.js'

interface APIKeyAuth {
  type: 'api_key'
  keys: Record<string, string>
}

interface OAuthAuth {
  type: 'oauth'
  access: string
  refresh: string
  expires: number
  accountId?: string
}

export type VaultAuth = APIKeyAuth | OAuthAuth

function getStoragePath(): string {
  return path.join(app.getPath('userData'), 'secure_vault.json')
}

function encryptString(text: string): string {
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.encryptString(text).toString('base64')
    } catch (e) {
      console.error('safeStorage encryption failed, falling back to base64', e)
    }
  }
  return Buffer.from(text).toString('base64')
}

function decryptString(encryptedBase64: string): string {
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(encryptedBase64, 'base64'))
    } catch (e) {
      console.error(
        'safeStorage decryption failed, falling back to base64 decode',
        e,
      )
    }
  }
  try {
    return Buffer.from(encryptedBase64, 'base64').toString('utf8')
  } catch (e) {
    console.error('Base64 decode failed', e)
    return ''
  }
}

function encryptAuth(auth: VaultAuth): VaultAuth {
  if (auth.type === 'api_key') {
    const encryptedKeys: Record<string, string> = {}
    for (const [k, v] of Object.entries(auth.keys || {})) {
      if (typeof v === 'string') {
        encryptedKeys[k] = encryptString(v)
      }
    }
    return { ...auth, keys: encryptedKeys }
  } else if (auth.type === 'oauth') {
    return {
      ...auth,
      access: auth.access ? encryptString(auth.access) : '',
      refresh: auth.refresh ? encryptString(auth.refresh) : '',
    }
  }
  return auth
}

function decryptAuth(auth: VaultAuth): VaultAuth {
  if (auth.type === 'api_key') {
    const decryptedKeys: Record<string, string> = {}
    for (const [k, v] of Object.entries(auth.keys || {})) {
      if (typeof v === 'string') {
        decryptedKeys[k] = decryptString(v)
      }
    }
    return { ...auth, keys: decryptedKeys }
  } else if (auth.type === 'oauth') {
    return {
      ...auth,
      access: auth.access ? decryptString(auth.access) : '',
      refresh: auth.refresh ? decryptString(auth.refresh) : '',
    }
  }
  return auth
}

function readVault(): Record<string, VaultAuth> {
  const filePath = getStoragePath()
  if (!fs.existsSync(filePath)) {
    return {}
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<
      string,
      VaultAuth
    >
  } catch (e) {
    console.error('Failed to read vault file', e)
    return {}
  }
}

function writeVault(vault: Record<string, VaultAuth>) {
  const filePath = getStoragePath()
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(vault, null, 2), 'utf8')
  } catch (e) {
    console.error('Failed to write vault file', e)
  }
}

export function storeCredentialInVault(
  providerId: string,
  auth: VaultAuth,
): void {
  const vault = readVault()
  vault[providerId] = encryptAuth(auth)
  writeVault(vault)
}

export function removeCredentialFromVault(providerId: string): void {
  const vault = readVault()
  delete vault[providerId]
  writeVault(vault)
}

let vaultServer: http.Server | null = null

export async function startVaultServer(): Promise<{
  port: number
  secret: string
}> {
  const secret = crypto.randomBytes(32).toString('hex')
  const port = await findFreePort(4000)

  const server = http.createServer((req, res) => {
    // 1. Authenticate using Bearer Token
    const authHeader = req.headers['authorization']
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }

    const url = new URL(
      req.url || '',
      `http://${req.headers.host || 'localhost'}`,
    )

    // 2. GET /credentials
    if (req.method === 'GET' && url.pathname === '/credentials') {
      const vault = readVault()
      const decrypted: Record<string, VaultAuth> = {}
      for (const [providerId, auth] of Object.entries(vault)) {
        decrypted[providerId] = decryptAuth(auth)
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(decrypted))
      return
    }

    // 3. POST /set-credential
    if (req.method === 'POST' && url.pathname === '/set-credential') {
      let body = ''
      req.on('data', (chunk: string) => {
        body += chunk
      })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as {
            providerId?: string
            auth?: VaultAuth
          }
          if (!parsed.providerId || !parsed.auth) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing providerId or auth' }))
            return
          }
          storeCredentialInVault(parsed.providerId, parsed.auth)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        }
      })
      return
    }

    // 4. POST /remove-credential
    if (req.method === 'POST' && url.pathname === '/remove-credential') {
      let body = ''
      req.on('data', (chunk: string) => {
        body += chunk
      })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { providerId?: string }
          if (!parsed.providerId) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing providerId' }))
            return
          }
          removeCredentialFromVault(parsed.providerId)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        }
      })
      return
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not Found' }))
  })

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      vaultServer = server
      console.log(
        `Electron secure vault server running on http://127.0.0.1:${port}`,
      )
      resolve({ port, secret })
    })
    server.on('error', (err) => {
      reject(err)
    })
  })
}

export function stopVaultServer() {
  if (vaultServer) {
    vaultServer.close()
    vaultServer = null
  }
}
