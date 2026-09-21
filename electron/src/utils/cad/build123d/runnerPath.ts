import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { app } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** `python/runner.py`, staged next to the app by electron-builder. */
export function resolveRunnerPath(): string {
  const runnerPath = path.join(
    app.isPackaged
      ? path.join(process.resourcesPath, 'python')
      : path.join(__dirname, '../../../..', 'python'),
    'runner.py',
  )

  if (!existsSync(runnerPath)) {
    throw new Error(`The build123d runner is missing at ${runnerPath}`)
  }

  return runnerPath
}
