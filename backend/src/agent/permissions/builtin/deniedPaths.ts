import path from 'node:path'

import { CONFIG_DIR, DATA_DIR } from 'shared'

import { isWithin } from '../../../utils/paths'

const DENIED_SEGMENTS = new Set(['.git', '.ssh', '.gnupg'])

const DENIED_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx', '.keystore'])

const DENIED_FILENAMES = new Set([
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  '.netrc',
  '.npmrc',
  '.pypirc',
])

/**
 * Paths no grant can open up, checked before any rule. Returns why, so the
 * refusal can say more than "denied".
 */
export function deniedPathReason(absolutePath: string): string | null {
  const normalized = path.resolve(absolutePath)

  for (const segment of normalized.split(path.sep)) {
    if (DENIED_SEGMENTS.has(segment)) {
      return `"${segment}" is off limits to the agent`
    }
  }

  const basename = path.basename(normalized)
  if (basename === '.env' || basename.startsWith('.env.')) {
    return 'environment files may hold secrets'
  }
  if (DENIED_FILENAMES.has(basename)) {
    return 'credential files are off limits to the agent'
  }
  if (DENIED_EXTENSIONS.has(path.extname(normalized).toLowerCase())) {
    return 'key and certificate files are off limits to the agent'
  }

  if (isWithin(CONFIG_DIR, normalized) || isWithin(DATA_DIR, normalized)) {
    return "this is OpenCAD's own configuration and data directory"
  }

  return null
}
