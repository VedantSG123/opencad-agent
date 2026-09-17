import path from 'node:path'

import { DATA_DIR } from 'shared'

const PYTHON_ROOT = path.join(DATA_DIR, 'python')

export const MANAGED_ENV_DIR = path.join(PYTHON_ROOT, 'env')

// Kept inside our own data directory rather than uv's defaults so that the
// interpreters and wheels we pull down travel with the app and can be removed
// with it, instead of landing in a shared uv install the user may also use.
export const UV_PYTHON_INSTALL_DIR = path.join(PYTHON_ROOT, 'interpreters')
export const UV_CACHE_DIR = path.join(PYTHON_ROOT, 'cache')

/** A venv keeps its interpreter in Scripts/ on Windows and bin/ elsewhere. */
export function interpreterPath(envDir: string): string {
  return process.platform === 'win32'
    ? path.join(envDir, 'Scripts', 'python.exe')
    : path.join(envDir, 'bin', 'python')
}

export const MANAGED_INTERPRETER = interpreterPath(MANAGED_ENV_DIR)
