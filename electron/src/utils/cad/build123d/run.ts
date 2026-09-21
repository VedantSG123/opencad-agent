import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { app } from 'electron'
import type { Build123dResult } from 'shared/build123d'

import { AppError } from '../../ipc-utils.js'
import { getPythonStatus } from '../../python/status.js'
import { resolveRunnerPath } from './runnerPath.js'

/** A script that has not finished by now is not going to. */
const RUN_TIMEOUT_MS = 120_000

// One build at a time: a second run makes the first one's result irrelevant, so
// it is cancelled rather than raced.
let current: ChildProcess | null = null

export function cancelBuild123dRun(): boolean {
  if (!current) {
    return false
  }
  current.kill()
  current = null
  return true
}

async function readyInterpreter(): Promise<string> {
  const status = await getPythonStatus()
  if (status.state !== 'ready') {
    throw new AppError(
      'PYTHON_NOT_READY',
      `The build123d environment is not ready (${status.state}).`,
    )
  }
  return status.interpreter
}

type SpawnOptions = {
  /** Directory the script runs in, so relative asset paths resolve. */
  cwd: string
  /** Extra sys.path entries, highest priority first. */
  searchPath?: string[]
}

function spawnRunner(
  interpreter: string,
  scriptPath: string,
  options: SpawnOptions,
): Promise<Build123dResult> {
  const runner = resolveRunnerPath()

  return new Promise((resolve, reject) => {
    const child = spawn(interpreter, [runner, scriptPath], {
      cwd: options.cwd,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        OPENCAD_SYS_PATH: (options.searchPath ?? []).join(path.delimiter),
      },
    })
    current = child

    // Collected as chunks and joined once: a model's payload runs to megabytes,
    // and concatenating a string per chunk copies the whole thing each time.
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk))

    const timer = setTimeout(() => {
      child.kill()
      reject(
        new AppError(
          'BUILD_TIMEOUT',
          `The script did not finish within ${RUN_TIMEOUT_MS / 1000}s.`,
        ),
      )
    }, RUN_TIMEOUT_MS)

    child.on('error', (error) => {
      clearTimeout(timer)
      current = null
      reject(error)
    })

    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (current === child) {
        current = null
      }

      if (signal) {
        reject(new AppError('BUILD_CANCELLED', 'The build was cancelled.'))
        return
      }

      const stdout = Buffer.concat(out).toString('utf-8')
      const stderr = Buffer.concat(err).toString('utf-8')

      // The runner reports a failing script as `ok: false` and still exits 0,
      // so a non-zero exit means the runner itself did not get that far.
      if (code !== 0 && !stdout) {
        reject(
          new AppError(
            'RUNNER_FAILED',
            stderr.trim() || `The runner exited with code ${code}.`,
          ),
        )
        return
      }

      try {
        resolve(JSON.parse(stdout) as Build123dResult)
      } catch {
        reject(
          new AppError(
            'RUNNER_OUTPUT_INVALID',
            `The runner produced output that is not a payload:\n${(stderr || stdout).slice(0, 2000)}`,
          ),
        )
      }
    })
  })
}

export type Build123dRunRequest = {
  mainPath: string
  projectDirectory: string
  /** Unsaved editor buffers, by absolute path. */
  overrides?: Record<string, string>
}

/**
 * Build a project.
 *
 * Unsaved buffers are written into a shadow tree rather than over the user's
 * files, and that tree leads sys.path - so an edited module wins, an unedited
 * one still resolves from the project, and nothing is written where the user
 * did not ask for it. The script runs with the project as its working
 * directory either way, so a path to a STEP file beside it still opens.
 */
export async function runBuild123dProject({
  mainPath,
  projectDirectory,
  overrides,
}: Build123dRunRequest): Promise<Build123dResult> {
  const interpreter = await readyInterpreter()
  cancelBuild123dRun()

  const dirty = Object.entries(overrides ?? {})
  if (dirty.length === 0) {
    return spawnRunner(interpreter, mainPath, { cwd: projectDirectory })
  }

  const shadow = path.join(
    app.getPath('temp'),
    'opencad-build123d',
    createHash('sha1').update(projectDirectory).digest('hex').slice(0, 16),
  )
  await fs.rm(shadow, { recursive: true, force: true })

  let scriptPath = mainPath
  for (const [filePath, content] of dirty) {
    const relative = path.relative(projectDirectory, filePath)
    // A buffer from outside the project has no place in its shadow tree.
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      continue
    }
    const shadowPath = path.join(shadow, relative)
    await fs.mkdir(path.dirname(shadowPath), { recursive: true })
    await fs.writeFile(shadowPath, content, 'utf-8')
    if (path.resolve(filePath) === path.resolve(mainPath)) {
      scriptPath = shadowPath
    }
  }

  return spawnRunner(interpreter, scriptPath, {
    cwd: projectDirectory,
    searchPath: [shadow, projectDirectory],
  })
}

/**
 * Build source that is not on disk - an editor buffer, or the hardcoded script
 * the test page sends. Written to one scratch file that is overwritten each
 * time, so a traceback names something that can still be opened and read.
 */
export async function runBuild123dSource(
  source: string,
): Promise<Build123dResult> {
  const interpreter = await readyInterpreter()
  cancelBuild123dRun()

  const scratchDir = path.join(app.getPath('temp'), 'opencad-build123d')
  const scratchPath = path.join(scratchDir, 'scratch.py')
  await fs.mkdir(scratchDir, { recursive: true })
  await fs.writeFile(scratchPath, source, 'utf-8')

  return spawnRunner(interpreter, scratchPath, { cwd: scratchDir })
}
