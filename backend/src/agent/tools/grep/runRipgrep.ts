import { spawn } from 'node:child_process'

import { resolveRipgrepPath } from './rgPath'

/** ripgrep exits with 1 when the search ran fine but matched nothing. */
export const RG_EXIT_NO_MATCH = 1

export type RipgrepRun = {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  outputTruncated: boolean
}

type RunRipgrepOptions = {
  args: string[]
  cwd: string
  timeoutMs: number
  maxBytes: number
  abortSignal?: AbortSignal
}

export async function runRipgrep({
  args,
  cwd,
  timeoutMs,
  maxBytes,
  abortSignal,
}: RunRipgrepOptions): Promise<RipgrepRun> {
  const rgPath = await resolveRipgrepPath()

  return new Promise<RipgrepRun>((resolve, reject) => {
    const child = spawn(rgPath, args, {
      cwd,
      // PowerShell, cmd.exe and POSIX shells disagree about quoting, and both
      // the pattern and the glob come from the model.
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let outputTruncated = false
    let timedOut = false
    let settled = false

    const stderrMaxBytes = 64 * 1024

    const cleanup = () => {
      clearTimeout(timer)
      abortSignal?.removeEventListener('abort', onAbort)
    }

    const settle = (run: RipgrepRun) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(run)
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    function onAbort() {
      child.kill()
    }

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)

    abortSignal?.addEventListener('abort', onAbort, { once: true })

    child.stdout.on('data', (chunk: Buffer) => {
      if (outputTruncated) return
      stdoutBytes += chunk.length
      if (stdoutBytes > maxBytes) {
        outputTruncated = true
        stdoutChunks.push(
          chunk.subarray(0, chunk.length - (stdoutBytes - maxBytes)),
        )
        child.kill()
        return
      }
      stdoutChunks.push(chunk)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBytes >= stderrMaxBytes) return
      stderrBytes += chunk.length
      stderrChunks.push(chunk)
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      fail(
        error.code === 'ENOENT'
          ? new Error(
              `ripgrep executable not found at "${rgPath}". In development, run \`bun install\` so @vscode/ripgrep provides a binary for ${process.platform}-${process.arch}; in a packaged build, this means scripts/prebuild.ts did not stage it into dist/assets. OPENCAD_RIPGREP_PATH overrides the lookup.`,
            )
          : error,
      )
    })

    child.on('close', (code) => {
      settle({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        exitCode: code,
        timedOut,
        outputTruncated,
      })
    })
  })
}
