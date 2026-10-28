import fs from 'node:fs/promises'
import path from 'node:path'

import { app } from 'electron'
import type {
  Build123dCancelRequest,
  Build123dExportFormat,
  Build123dExportResult,
  Build123dProjectRequest,
  Build123dResult,
  Build123dSourceRequest,
} from 'shared/build123d'
import { BUILD123D_EXPORT_EXTENSIONS } from 'shared/build123d'

import { AppError } from '../../ipc-utils.js'
import { getPythonStatus } from '../../python/status.js'
import { Build123dRuns } from './jobs.js'
import { runPython } from './process.js'
import { resolvePythonEntry } from './runnerPath.js'

const runs = new Build123dRuns()

export function cancelBuild123dRun(
  request: Build123dCancelRequest,
  ownerId: number,
): boolean {
  return runs.cancel({ ...request, ownerId })
}

export function cancelBuild123dOwner(ownerId: number): void {
  runs.cancelOwner(ownerId)
}

export function cancelAllBuild123dRuns(): Promise<void> {
  return runs.cancelAll()
}

async function withRunFiles<T>(
  signal: AbortSignal,
  execute: (interpreter: string, directory: string) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted()
  const status = await getPythonStatus()
  signal.throwIfAborted()
  if (status.state !== 'ready') {
    throw new AppError(
      'PYTHON_NOT_READY',
      `The build123d environment is not ready (${status.state}).`,
    )
  }

  const directory = await fs.mkdtemp(
    path.join(app.getPath('temp'), 'opencad-build123d-'),
  )
  try {
    signal.throwIfAborted()
    return await execute(status.interpreter, directory)
  } finally {
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 3 })
  }
}

async function writeOverrides(
  overrides: Build123dProjectRequest['overrides'],
  directory: string,
): Promise<string | undefined> {
  if (!overrides || Object.keys(overrides).length === 0) return undefined
  const manifest = path.join(directory, 'overrides.json')
  await fs.writeFile(manifest, JSON.stringify(overrides), 'utf-8')
  return manifest
}

export function runBuild123dProject(
  request: Build123dProjectRequest,
  ownerId: number,
): Promise<Build123dResult> {
  return runs.run({ ...request, ownerId }, 'preview', (signal) =>
    withRunFiles(signal, async (interpreter, directory) => {
      const overridesPath = await writeOverrides(request.overrides, directory)
      return runPython({
        interpreter,
        entry: resolvePythonEntry('runner.py'),
        args: [request.mainPath],
        cwd: request.projectDirectory,
        overridesPath,
        signal,
      })
    }),
  )
}

export function runBuild123dSource(
  request: Build123dSourceRequest,
  ownerId: number,
): Promise<Build123dResult> {
  return runs.run({ ...request, ownerId }, 'preview', (signal) =>
    withRunFiles(signal, async (interpreter, directory) => {
      const scriptPath = path.join(directory, 'scratch.py')
      await fs.writeFile(scriptPath, request.source, 'utf-8')
      return runPython({
        interpreter,
        entry: resolvePythonEntry('runner.py'),
        args: [scriptPath],
        cwd: directory,
        signal,
      })
    }),
  )
}

export function exportBuild123d(
  request: Build123dProjectRequest & { format: Build123dExportFormat },
  ownerId: number,
): Promise<Build123dExportResult> {
  return runs.run({ ...request, ownerId }, 'export', (signal) =>
    withRunFiles(signal, async (interpreter, directory) => {
      const overridesPath = await writeOverrides(request.overrides, directory)
      const extension = BUILD123D_EXPORT_EXTENSIONS[request.format]
      const outputPath = path.join(directory, `model.${extension}`)
      const result = await runPython({
        interpreter,
        entry: resolvePythonEntry('exporter.py'),
        args: [request.mainPath, request.format, outputPath],
        cwd: request.projectDirectory,
        overridesPath,
        signal,
      })
      if (!result.ok) return result
      signal.throwIfAborted()
      return {
        ok: true,
        logs: result.logs,
        duration: result.duration,
        extension,
        data: await fs.readFile(outputPath),
      }
    }),
  )
}
