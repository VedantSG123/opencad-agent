import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { app } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const UV_BINARY = process.platform === 'win32' ? 'uv.exe' : 'uv'

/**
 * The uv binary staged by `scripts/setup-uv.ts`, which builds and populates the
 * Python environment build123d projects compile in.
 *
 * `OPENCAD_UV_PATH` overrides both modes, for a machine that would rather use
 * an already-installed uv than the staged one.
 */
export function resolveUvPath(): string {
  const override = process.env.OPENCAD_UV_PATH
  if (override) {
    return override
  }

  const uvPath = path.join(
    app.isPackaged
      ? path.join(process.resourcesPath, 'uv-bin')
      : path.join(__dirname, '../../..', 'uv-bin'),
    UV_BINARY,
  )

  if (!existsSync(uvPath)) {
    throw new Error(
      `uv is missing at ${uvPath}. Run \`bun scripts/setup-uv.ts\` from electron/, or set OPENCAD_UV_PATH.`,
    )
  }

  return uvPath
}
