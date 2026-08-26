import { afterAll, describe, expect, test } from 'bun:test'
import os from 'node:os'

import { shell } from '../../../../agent/tools/shell'
import { shutdownPowerShellParsers } from '../../../../agent/tools/shell/parse/powershell'
import { describeShellAccess } from '../../../../agent/tools/shell/permissions'
import { runCommand } from '../../../../agent/tools/shell/runCommand'
import { resolveShell } from '../../../../agent/tools/shell/shellEnvironment'

const SHELL_AVAILABLE = resolveShell() !== null
const IS_WINDOWS = os.platform() === 'win32'

/** Same command, written for whichever shell this machine runs. */
const say = (text: string): string =>
  IS_WINDOWS ? `Write-Output '${text}'` : `echo '${text}'`

const context = { workingDirectory: process.cwd() }

afterAll(() => {
  shutdownPowerShellParsers()
})

describe.skipIf(!SHELL_AVAILABLE)('shell', () => {
  test('returns the output of a command', async () => {
    const result = await shell({ command: say('hello') }, context)

    expect(result).toContain('hello')
  })

  test('echoes the command it ran', async () => {
    const result = await shell({ command: say('hello') }, context)

    expect(result).toContain(`$ ${say('hello')}`)
  })

  test('reports a non-zero exit code', async () => {
    const result = await shell({ command: 'exit 3' }, context)

    expect(result).toContain('Exit code: 3')
  })

  test('says so when a command produced nothing', async () => {
    const result = await shell(
      { command: IS_WINDOWS ? '$null' : 'true' },
      context,
    )

    expect(result).toContain('(no output)')
  })

  // stderr is interleaved rather than separated: a command's errors usually
  // explain its output, and the model reads this as a terminal would show it.
  test('includes what a command wrote to stderr', async () => {
    const result = await shell(
      {
        command: IS_WINDOWS
          ? '[Console]::Error.WriteLine("trouble")'
          : 'echo trouble 1>&2',
      },
      context,
    )

    expect(result).toContain('trouble')
  })

  test('runs in the directory it was given', async () => {
    const result = await shell(
      { command: IS_WINDOWS ? 'Get-Location' : 'pwd' },
      { workingDirectory: os.tmpdir() },
    )

    expect(result.toLowerCase()).toContain(
      os.tmpdir().toLowerCase().split(/[/\\]/).filter(Boolean).slice(-1)[0] ??
        '',
    )
  })
})

describe.skipIf(!SHELL_AVAILABLE)('runCommand', () => {
  test('stops a command that runs too long, and says so', async () => {
    const run = await runCommand({
      command: IS_WINDOWS ? 'Start-Sleep -Seconds 30' : 'sleep 30',
      cwd: process.cwd(),
      timeoutMs: 1500,
      maxBytes: 1024,
      abortSignal: undefined,
    })

    expect(run.timedOut).toBe(true)
  }, 20_000)

  test('stops when the caller aborts', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 300)

    const run = await runCommand({
      command: IS_WINDOWS ? 'Start-Sleep -Seconds 30' : 'sleep 30',
      cwd: process.cwd(),
      timeoutMs: 30_000,
      maxBytes: 1024,
      abortSignal: controller.signal,
    })

    expect(run.aborted).toBe(true)
  }, 20_000)

  test('caps how much output it keeps', async () => {
    const run = await runCommand({
      command: IS_WINDOWS
        ? "1..2000 | ForEach-Object { 'xxxxxxxxxxxxxxxxxxxx' }"
        : 'for i in $(seq 1 2000); do echo xxxxxxxxxxxxxxxxxxxx; done',
      cwd: process.cwd(),
      timeoutMs: 30_000,
      maxBytes: 512,
      abortSignal: undefined,
    })

    expect(run.outputTruncated).toBe(true)
    expect(run.output.length).toBeLessThanOrEqual(512)
  }, 20_000)
})

describe('describeShellAccess', () => {
  test('declares the command it would run', () => {
    expect(describeShellAccess({ command: 'bun add zod' })).toEqual([
      { kind: 'command', command: 'bun add zod' },
    ])
  })

  // An input the tool would refuse declares nothing, and the policy layer
  // treats a tool that declares nothing as having nothing to weigh.
  test('declares nothing for input the tool would reject', () => {
    expect(describeShellAccess({ command: '' })).toEqual([])
    expect(describeShellAccess({})).toEqual([])
    expect(describeShellAccess(null)).toEqual([])
  })
})
