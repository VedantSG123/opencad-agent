import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'

import {
  BUILD123D_VERSION,
  PYTHON_INSTALL_SPECS,
  PYTHON_INSTALL_STEPS,
  PYTHON_VERSION,
} from 'shared/python'
import type {
  PythonEnvStatus,
  PythonInstallProgress,
  PythonInstallStep,
} from 'shared/python'

import { AppError } from '../ipc-utils.js'
import {
  MANAGED_ENV_DIR,
  MANAGED_INTERPRETER,
  UV_CACHE_DIR,
  UV_PYTHON_INSTALL_DIR,
} from './paths.js'
import { probeInterpreter } from './probe.js'
import { getPythonStatus, invalidatePythonStatus } from './status.js'
import { resolveUvPath } from './uvPath.js'

/** How much of uv's output a failure carries back, in lines. */
const ERROR_TAIL = 40

class InstallCanceled extends Error {}

type RunningInstall = {
  step: PythonInstallStep
  child: ChildProcess | null
  canceled: boolean
}

let running: RunningInstall | null = null

export function getRunningInstall(): { step: PythonInstallStep } | null {
  return running ? { step: running.step } : null
}

export function cancelPythonInstall(): boolean {
  if (!running) {
    return false
  }
  running.canceled = true
  running.child?.kill()
  return true
}

function runUv(args: string[], onLine: (line: string) => void): Promise<void> {
  const uv = resolveUvPath()

  return new Promise((resolve, reject) => {
    const child = spawn(uv, args, {
      env: {
        ...process.env,
        UV_PYTHON_INSTALL_DIR,
        UV_CACHE_DIR,
        NO_COLOR: '1',
        // build123d installs from a GitHub archive, which carries no git
        // history for setuptools_scm to read a version out of.
        SETUPTOOLS_SCM_PRETEND_VERSION_FOR_BUILD123D: BUILD123D_VERSION,
      },
    })

    if (running) {
      running.child = child
    }

    const tail: string[] = []
    let pending = ''

    // uv redraws its progress with a bare carriage return, so a split on
    // newlines alone would accumulate a whole download into one line.
    const consume = (chunk: Buffer) => {
      pending += chunk.toString()
      const parts = pending.split(/[\r\n]+/)
      pending = parts.pop() ?? ''
      for (const line of parts) {
        if (!line.trim()) {
          continue
        }
        tail.push(line)
        if (tail.length > ERROR_TAIL) {
          tail.shift()
        }
        onLine(line)
      }
    }

    child.stdout.on('data', consume)
    child.stderr.on('data', consume)

    child.on('error', reject)
    child.on('close', (code) => {
      if (running) {
        running.child = null
      }
      if (running?.canceled) {
        reject(new InstallCanceled())
      } else if (code === 0) {
        resolve()
      } else {
        reject(
          new Error(`uv ${args[0]} failed (exit ${code})\n${tail.join('\n')}`),
        )
      }
    })
  })
}

export async function installPythonEnv(
  onProgress: (progress: PythonInstallProgress) => void,
): Promise<PythonEnvStatus> {
  if (running) {
    throw new AppError(
      'PYTHON_INSTALL_RUNNING',
      'A Python setup is already running',
    )
  }

  running = { step: 'interpreter', child: null, canceled: false }
  invalidatePythonStatus()

  const log = (line: string) => onProgress({ type: 'log', line })
  const begin = (step: PythonInstallStep) => {
    if (running) {
      running.step = step
    }
    onProgress({
      type: 'step',
      step,
      index: PYTHON_INSTALL_STEPS.indexOf(step) + 1,
      total: PYTHON_INSTALL_STEPS.length,
    })
  }

  const finish = (status: PythonEnvStatus) => {
    onProgress({ type: 'done', status })
    return status
  }

  try {
    begin('interpreter')
    await runUv(['python', 'install', PYTHON_VERSION], log)

    begin('environment')
    // A venv built over the remains of a failed one inherits its broken
    // site-packages, so every install starts from an empty directory.
    await fs.rm(MANAGED_ENV_DIR, { recursive: true, force: true })
    await runUv(['venv', MANAGED_ENV_DIR, '--python', PYTHON_VERSION], log)

    begin('packages')
    await runUv(
      [
        'pip',
        'install',
        '--python',
        MANAGED_INTERPRETER,
        ...PYTHON_INSTALL_SPECS,
      ],
      log,
    )

    begin('validate')
    const probe = await probeInterpreter(MANAGED_INTERPRETER)
    if (!probe.ok) {
      throw new Error(probe.reason)
    }

    invalidatePythonStatus()
    return finish(await getPythonStatus())
  } catch (error: unknown) {
    const step = running.step
    invalidatePythonStatus()

    // A cancelled install leaves a half-built environment behind, so the
    // honest answer is whatever probing finds now, not a failure.
    if (error instanceof InstallCanceled) {
      return finish(await getPythonStatus())
    }

    return finish({
      state: 'failed',
      step,
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    running = null
  }
}

export async function repairPythonEnv(
  onProgress: (progress: PythonInstallProgress) => void,
): Promise<PythonEnvStatus> {
  await fs.rm(MANAGED_ENV_DIR, { recursive: true, force: true })
  invalidatePythonStatus()
  return installPythonEnv(onProgress)
}
