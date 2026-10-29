import type {
  ChildProcess,
  ChildProcessWithoutNullStreams,
} from 'node:child_process'
import { spawn } from 'node:child_process'
import os from 'node:os'

import type { Build123dExportFormat } from 'shared/build123d'

import { AppError } from '../../ipc-utils.js'

export type ScriptInput = {
  script: string
  cwd: string
  sysPath: string[]
  overridesPath: string | null
  geometrySummary?: boolean
}

export type ExportInput = ScriptInput & {
  format: Build123dExportFormat
  output: string
}

type PythonRequest<T> = {
  input: ScriptInput | ExportInput
  signal: AbortSignal
  timeoutMs?: number
  parseResult: (value: unknown) => T
}

type Exit = {
  code: number | null
  signal: NodeJS.Signals | null
  error?: Error
}

function cancellationError(signal: AbortSignal): AppError {
  return signal.reason instanceof AppError
    ? signal.reason
    : new AppError('BUILD_CANCELLED', 'The build was cancelled.')
}

function terminateTree(child: ChildProcess): Promise<void> {
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
      } catch {
        // The group exited on SIGTERM.
      }
      resolve()
    }, 250)
  })
}

/**
 * One Python entry point, started before its request is known.
 *
 * The entry imports what it needs and then blocks reading stdin, so starting a
 * process early moves its import cost off the build. Each process serves one
 * request and exits.
 */
export class PythonProcess {
  readonly interpreter: string
  readonly #child: ChildProcessWithoutNullStreams
  readonly #exit: Promise<Exit>
  readonly #stdout: Buffer[] = []
  readonly #stderr: Buffer[] = []
  #used = false

  constructor(interpreter: string, entry: string) {
    this.interpreter = interpreter
    const child = spawn(interpreter, [entry], {
      cwd: os.tmpdir(),
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONDONTWRITEBYTECODE: '1',
      },
    })
    this.#child = child
    child.stdout.on('data', (chunk: Buffer) => this.#stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => this.#stderr.push(chunk))
    // Writing to a process that has already exited fails with EPIPE; its exit
    // is what gets reported.
    child.stdin.on('error', () => {})
    this.#exit = new Promise((resolve) => {
      let error: Error | undefined
      child.on('error', (spawnError) => {
        error = spawnError
      })
      child.on('close', (code, signal) => resolve({ code, signal, error }))
    })
  }

  get alive(): boolean {
    return (
      this.#child.pid !== undefined &&
      this.#child.exitCode === null &&
      this.#child.signalCode === null
    )
  }

  terminate(): Promise<void> {
    return terminateTree(this.#child)
  }

  run<T>(request: PythonRequest<T>): Promise<T> {
    if (this.#used) {
      throw new Error('A Python process serves a single request.')
    }
    this.#used = true

    if (request.signal.aborted) {
      void this.terminate()
      return Promise.reject(cancellationError(request.signal))
    }

    return new Promise<T>((resolve, reject) => {
      let stopReason: AppError | undefined
      let stopping: Promise<void> | undefined

      const stop = (reason: AppError) => {
        if (stopReason) return
        stopReason = reason
        clearTimeout(timer)
        stopping = this.terminate()
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
      this.#child.stdin.end(JSON.stringify(request.input))

      void this.#exit.then(async ({ code, signal, error }) => {
        clearTimeout(timer)
        request.signal.removeEventListener('abort', onAbort)
        await stopping
        if (stopReason) {
          reject(stopReason)
          return
        }
        if (error) {
          reject(error)
          return
        }
        const stdout = Buffer.concat(this.#stdout).toString('utf-8')
        const stderr = Buffer.concat(this.#stderr).toString('utf-8')
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
        } catch (parseError) {
          const message =
            parseError instanceof Error
              ? parseError.message
              : String(parseError)
          reject(
            new AppError(
              'RUNNER_OUTPUT_INVALID',
              `The Python runner returned an invalid result: ${message.slice(0, 2000)}`,
            ),
          )
        }
      })
    })
  }
}
