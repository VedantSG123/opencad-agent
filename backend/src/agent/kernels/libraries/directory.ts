import path from 'node:path'

import { CACHE_DIR } from 'shared'

/**
 * Where the app installs the libraries the agent reads for reference. Kept in
 * a module of its own, so the permission policy can name it without loading
 * the libraries.
 */
export const LIBRARIES_DIR = path.join(CACHE_DIR, 'libraries')

export function libraryDirectory(name: string, version: string): string {
  return path.join(LIBRARIES_DIR, `${name}-${version}`)
}
