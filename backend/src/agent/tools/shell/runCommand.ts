import { spawn, spawnSync } from 'node:child_process'
import os from 'node:os'

import { hardenedEnvironment, resolveShell } from './shellEnvironment'

/** How long a terminated process is given to exit before it is killed outright. */
const ESCALATE_AFTER_MS = 200

export type CommandRun = {
  output: string
  exitCode: number | null
  timedOut: boolean
  aborted: boolean
  outputTruncated: boolean
}

export type RunCommandOptions = {
  command: string
  cwd: string
  timeoutMs: number
  maxBytes: number
  abortSignal?: AbortSignal
}

/**
 * Ends a process and everything it started. A shell command routinely leaves
 * children behind, and killing only the shell would orphan them.
 */
function killTree(pid: number): void {
  if (os.platform() === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/f', '/t'], {
      windowsHide: true,
    })
    return
  }

  // Negative pid signals the whole group, which `detached` gave the child.
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    // Already gone.
  }
  setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }, ESCALATE_AFTER_MS)
}

export async function runCommand({
  command,
  cwd,
  timeoutMs,
  maxBytes,
  abortSignal,
}: RunCommandOptions): Promise<CommandRun> {
  const shell = resolveShell()
  if (shell === null) {
    throw new Error('No shell could be found to run commands with.')
  }

  return new Promise<CommandRun>((resolve, reject) => {
    const isWindows = os.platform() === 'win32'
    const child = spawn(shell.executable, [...shell.argsPrefix, command], {
      cwd,
      // The command is one argv entry that the shell itself reads. Letting
      // Node add a second shell would mean two of them parsing the same text.
      shell: false,
      windowsHide: true,
      // A process group so the whole tree can be signalled together. Windows
      // has no groups; taskkill /t walks the tree there instead.
      detached: !isWindows,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: hardenedEnvironment(),
    })

    const chunks: Buffer[] = []
    let bytes = 0
    let outputTruncated = false
    let timedOut = false
    let aborted = false
    let settled = false

    const collect = (chunk: Buffer): void => {
      if (bytes >= maxBytes) {
        outputTruncated = true
        return
      }
      const room = maxBytes - bytes
      chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk)
      bytes += Math.min(chunk.length, room)
      if (chunk.length > room) outputTruncated = true
    }

    // Interleaved into one stream: the model reads this as a terminal would
    // show it, and a command's errors usually explain its output.
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)

    const stop = (): void => {
      if (child.pid !== undefined) killTree(child.pid)
    }

    const timer = setTimeout(() => {
      timedOut = true
      stop()
    }, timeoutMs)

    const onAbort = (): void => {
      aborted = true
      stop()
    }
    abortSignal?.addEventListener('abort', onAbort, { once: true })

    const finish = (settle: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      abortSignal?.removeEventListener('abort', onAbort)
      settle()
    }

    child.on('error', (error) => {
      finish(() => reject(error))
    })

    child.on('close', (exitCode) => {
      finish(() =>
        resolve({
          output: Buffer.concat(chunks).toString('utf-8'),
          exitCode,
          timedOut,
          aborted,
          outputTruncated,
        }),
      )
    })

    if (abortSignal?.aborted) onAbort()
  })
}
