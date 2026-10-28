import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'

import { AppError } from '../../ipc-utils.js'

type PythonRequest<T> = {
  interpreter: string
  entry: string
  args: string[]
  cwd: string
  overridesPath?: string
  signal: AbortSignal
  timeoutMs?: number
  parseResult: (value: unknown) => T
}

function cancellationError(signal: AbortSignal): AppError {
  return signal.reason instanceof AppError
    ? signal.reason
    : new AppError('BUILD_CANCELLED', 'The build was cancelled.')
}

function terminate(child: ChildProcess): Promise<void> {
  const pid = child.pid
  if (pid === undefined) return Promise.resolve()
  const killChild = () => {
    child.kill('SIGKILL')
  }

  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.on('error', killChild)
      killer.on('close', (code) => {
        if (code !== 0) killChild()
        resolve()
      })
    })
  }

  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    killChild()
    return Promise.resolve()
  }

  // A parent can exit on SIGTERM while a descendant keeps its process group alive.
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {}
      resolve()
    }, 250)
  })
}

export function runPython<T>(request: PythonRequest<T>): Promise<T> {
  if (request.signal.aborted) {
    return Promise.reject(cancellationError(request.signal))
  }

  return new Promise<T>((resolve, reject) => {
    const child = spawn(request.interpreter, [request.entry, ...request.args], {
      cwd: request.cwd,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONDONTWRITEBYTECODE: '1',
        OPENCAD_SYS_PATH: request.cwd,
        OPENCAD_OVERRIDES_PATH: request.overridesPath ?? '',
      },
    })
    const output: Buffer[] = []
    const errors: Buffer[] = []
    let stopReason: AppError | undefined
    let stopping: Promise<void> | undefined
    let spawnError: Error | undefined

    const stop = (reason: AppError) => {
      if (stopReason) return
      stopReason = reason
      clearTimeout(timer)
      stopping = terminate(child)
    }
    const onAbort = () => stop(cancellationError(request.signal))
    const timeoutMs = request.timeoutMs ?? 120_000
    const timer = setTimeout(() => {
      stop(
        new AppError(
          'BUILD_TIMEOUT',
          `The script did not finish within ${timeoutMs / 1000}s.`,
        ),
      )
    }, timeoutMs)

    request.signal.addEventListener('abort', onAbort, { once: true })
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
    child.on('error', (error) => {
      spawnError = error
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      request.signal.removeEventListener('abort', onAbort)

      void (async () => {
        await stopping
        if (stopReason) {
          reject(stopReason)
          return
        }
        if (spawnError) {
          reject(spawnError)
          return
        }
        const stdout = Buffer.concat(output).toString('utf-8')
        const stderr = Buffer.concat(errors).toString('utf-8')
        if (signal || code !== 0) {
          reject(
            new AppError(
              'RUNNER_FAILED',
              stderr.trim() ||
                `The runner exited with ${signal ? `signal ${signal}` : `code ${code}`}.`,
            ),
          )
          return
        }

        let payload: unknown
        try {
          payload = JSON.parse(stdout)
        } catch {
          reject(
            new AppError(
              'RUNNER_OUTPUT_INVALID',
              `The Python runner did not return valid JSON.${stderr.trim() ? `\n${stderr.trim().slice(0, 2000)}` : ''}`,
            ),
          )
          return
        }

        try {
          resolve(request.parseResult(payload))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          reject(
            new AppError(
              'RUNNER_OUTPUT_INVALID',
              `The Python runner returned an invalid result: ${message.slice(0, 2000)}`,
            ),
          )
        }
      })()
    })
  })
}
