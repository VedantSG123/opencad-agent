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
import {
  BUILD123D_EXPORT_EXTENSIONS,
  parseBuild123dExportReport,
  parseBuild123dResult,
} from 'shared/build123d'

import { AppError } from '../../ipc-utils.js'
import {
  getPythonStatus,
  onPythonStatusInvalidated,
} from '../../python/status.js'
import { Build123dRuns } from './jobs.js'
import { PythonProcess } from './process.js'
import { resolvePythonEntry } from './runnerPath.js'
import { PreviewSpares } from './spares.js'

const runs = new Build123dRuns()
const spares = new PreviewSpares(() => resolvePythonEntry('runner.py'))

onPythonStatusInvalidated(() => void spares.discardAll())

export function cancelBuild123dRun(
  request: Build123dCancelRequest,
  ownerId: number,
): boolean {
  return runs.cancel({ ...request, ownerId })
}

export function cancelBuild123dOwner(ownerId: number): void {
  runs.cancelOwner(ownerId)
  void spares.discardOwner(ownerId)
}

export async function cancelAllBuild123dRuns(): Promise<void> {
  await runs.cancelAll()
  await spares.discardAll()
}

function previewProcess(
  ownerId: number,
  interpreter: string,
  signal: AbortSignal,
): PythonProcess {
  // A job cancelled along with its window must not leave a spare behind.
  signal.throwIfAborted()
  return spares.take(ownerId, interpreter)
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
): Promise<string | null> {
  if (!overrides || Object.keys(overrides).length === 0) return null
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
      return previewProcess(ownerId, interpreter, signal).run({
        input: {
          script: request.mainPath,
          cwd: request.projectDirectory,
          sysPath: [request.projectDirectory],
          overridesPath,
        },
        parseResult: parseBuild123dResult,
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
      return previewProcess(ownerId, interpreter, signal).run({
        input: {
          script: scriptPath,
          cwd: directory,
          sysPath: [directory],
          overridesPath: null,
        },
        parseResult: parseBuild123dResult,
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
      const result = await new PythonProcess(
        interpreter,
        resolvePythonEntry('exporter.py'),
      ).run({
        input: {
          script: request.mainPath,
          cwd: request.projectDirectory,
          sysPath: [request.projectDirectory],
          overridesPath,
          format: request.format,
          output: outputPath,
        },
        parseResult: parseBuild123dExportReport,
        signal,
      })
      if (!result.ok) return result
      signal.throwIfAborted()
      const data = await fs.readFile(outputPath)
      if (data.byteLength !== result.bytes) {
        throw new AppError(
          'RUNNER_OUTPUT_INVALID',
          `The Python exporter reported ${result.bytes} bytes but wrote ${data.byteLength}.`,
        )
      }
      return {
        ok: true,
        logs: result.logs,
        duration: result.duration,
        extension,
        data,
      }
    }),
  )
}
