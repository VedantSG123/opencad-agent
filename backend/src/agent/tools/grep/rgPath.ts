import path from 'node:path'

import { isCompiled } from '../../../utils/runtime'

const RG_BINARY_NAME = process.platform === 'win32' ? 'rg.exe' : 'rg'
const ASSETS_DIR_NAME = 'assets'

let cachedPath: string | undefined

export async function resolveRipgrepPath(): Promise<string> {
  cachedPath ??= await findRipgrepPath()
  return cachedPath
}

export async function findRipgrepPath(): Promise<string> {
  if (process.env.OPENCAD_RIPGREP_PATH) {
    return process.env.OPENCAD_RIPGREP_PATH
  }

  if (isCompiled) {
    // node_modules does not ship with the compiled binary; scripts/prebuild.ts
    // stages rg into dist/assets instead.
    return path.join(
      path.dirname(process.execPath),
      ASSETS_DIR_NAME,
      RG_BINARY_NAME,
    )
  }

  // @vscode/ripgrep throws at module scope when the optional dependency for
  // this platform/arch is not installed.
  const { rgPath } = await import('@vscode/ripgrep')
  return rgPath
}
