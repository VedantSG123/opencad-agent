import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { app } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** One of the Python entry points, staged beside the app by electron-builder. */
export function resolvePythonEntry(name: 'runner.py' | 'exporter.py'): string {
  const entry = path.join(
    app.isPackaged
      ? path.join(process.resourcesPath, 'python')
      : path.join(__dirname, '../../../..', 'python'),
    name,
  )

  if (!existsSync(entry)) {
    throw new Error(`The build123d ${name} is missing at ${entry}`)
  }

  return entry
}
