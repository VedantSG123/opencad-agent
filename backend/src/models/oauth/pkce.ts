import * as crypto from 'crypto'

export interface PkceCodes {
  verifier: string
  challenge: string
}

export function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function generateRandomString(length: number): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = crypto.randomBytes(length)
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('')
}

export function generatePKCE(): PkceCodes {
  const verifier = generateRandomString(43)
  const hash = crypto.createHash('sha256').update(verifier).digest()
  return { verifier, challenge: base64UrlEncode(hash) }
}
