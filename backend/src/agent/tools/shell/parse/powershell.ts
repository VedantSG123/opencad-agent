import { type ChildProcessByStdio, spawn, spawnSync } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'

import { inlineFile } from '../../../../utils/macro' with { type: 'macro' }
import type { ParsedCommand, ParseResult } from './types'

const POWERSHELL_PARSER_SCRIPT = inlineFile(
  'agent/tools/shell/parse/powershell.ps1',
)

const PARSE_TIMEOUT_MS = 10_000

type ParserStatus = 'ok' | 'unsupported' | 'parseErrors' | 'parseFailed'

type ParserResponse = {
  id: number
  status: ParserStatus
  commands?: string[][]
  hasSubstitution?: boolean
  hasRedirection?: boolean
}

const FAILURE_REASONS: Record<Exclude<ParserStatus, 'ok'>, string> = {
  unsupported:
    'PowerShell parsed the command but it uses constructs - variables, subexpressions or splatting - that cannot be reduced to plain words.',
  parseErrors: 'The command is not valid PowerShell syntax.',
  parseFailed: 'PowerShell could not parse the command.',
}

/** PowerShell reads `-EncodedCommand` as base64 of UTF-16LE, not UTF-8. */
function encodeForPowerShell(script: string): string {
  const utf16 = Buffer.from(script, 'utf16le')
  return utf16.toString('base64')
}

function isExecutableAvailable(executable: string): boolean {
  const probe = spawnSync(executable, ['-NoProfile', '-Command', 'exit 0'], {
    encoding: 'utf-8',
    timeout: PARSE_TIMEOUT_MS,
  })
  return !probe.error && probe.status === 0
}

let cachedExecutable: string | null | undefined

/**
 * PowerShell 7 first: it and Windows PowerShell 5.1 accept different language
 * surfaces, and 5.1 is only the fallback because it is the one guaranteed to
 * be present on Windows.
 */
export function findPowerShell(): string | null {
  if (cachedExecutable === undefined) {
    cachedExecutable =
      ['pwsh.exe', 'pwsh', 'powershell.exe'].find(isExecutableAvailable) ?? null
  }
  return cachedExecutable
}

class ParserProcess {
  private readonly child: ChildProcessByStdio<Writable, Readable, null>
  private buffer = ''
  private nextId = 0
  private pending:
    | {
        id: number
        resolve: (value: ParserResponse) => void
        reject: (error: Error) => void
      }
    | undefined
  private dead = false

  constructor(executable: string) {
    this.child = spawn(
      executable,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        encodeForPowerShell(POWERSHELL_PARSER_SCRIPT),
      ],
      { stdio: ['pipe', 'pipe', 'ignore'] },
    )
    this.child.stdout.setEncoding('utf-8')
    this.child.stdout.on('data', (chunk: string) => this.consume(chunk))
    this.child.on('exit', () =>
      this.fail(new Error('PowerShell parser exited')),
    )
    this.child.on('error', (error) => this.fail(error))
  }

  private consume(chunk: string): void {
    this.buffer += chunk
    let newline = this.buffer.indexOf('\n')
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (line) this.settle(line)
      newline = this.buffer.indexOf('\n')
    }
  }

  private settle(line: string): void {
    const pending = this.pending
    if (!pending) return

    let response: ParserResponse
    try {
      response = JSON.parse(line) as ParserResponse
    } catch {
      pending.reject(new Error('PowerShell parser returned malformed JSON'))
      return
    }

    // Requests are serialized, so a mismatched id means stdout carries
    // something we did not ask for and the child can no longer be trusted.
    if (response.id !== pending.id) {
      pending.reject(new Error('PowerShell parser responded out of order'))
      return
    }
    pending.resolve(response)
  }

  private fail(error: Error): void {
    this.dead = true
    this.pending?.reject(error)
    this.pending = undefined
  }

  isDead(): boolean {
    return this.dead
  }

  kill(): void {
    this.dead = true
    this.child.kill()
  }

  request(script: string): Promise<ParserResponse> {
    if (this.dead)
      return Promise.reject(new Error('PowerShell parser is not running'))

    const id = this.nextId++
    return new Promise<ParserResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.kill()
        reject(new Error('PowerShell parser timed out'))
      }, PARSE_TIMEOUT_MS)

      this.pending = {
        id,
        resolve: (value) => {
          clearTimeout(timer)
          this.pending = undefined
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          this.pending = undefined
          reject(error)
        },
      }

      this.child.stdin.write(
        `${JSON.stringify({ id, payload: encodeForPowerShell(script) })}\n`,
      )
    })
  }
}

const processes = new Map<string, ParserProcess>()

/** One request at a time per child: each speaks over a single stdin/stdout pair. */
let queue: Promise<unknown> = Promise.resolve()

function processFor(executable: string): ParserProcess {
  const existing = processes.get(executable)
  if (existing && !existing.isDead()) return existing

  const created = new ParserProcess(executable)
  processes.set(executable, created)
  return created
}

async function requestWithRetry(
  executable: string,
  script: string,
): Promise<ParserResponse> {
  try {
    return await processFor(executable).request(script)
  } catch {
    // A cached child that died between requests is the common failure, so
    // replace it and try once more before giving up.
    processes.delete(executable)
    return await processFor(executable).request(script)
  }
}

export async function parsePowerShellCommand(
  command: string,
): Promise<ParseResult> {
  if (command.trim() === '') {
    return { ok: false, reason: 'The command is empty.' }
  }

  const executable = findPowerShell()
  if (!executable) {
    return {
      ok: false,
      reason: 'PowerShell could not be found to check this command.',
    }
  }

  const run = queue.then(() => requestWithRetry(executable, command))
  queue = run.catch(() => undefined)

  let response: ParserResponse
  try {
    response = await run
  } catch (error) {
    return {
      ok: false,
      reason: `PowerShell could not be run to check this command: ${(error as Error).message}`,
    }
  }

  if (response.status !== 'ok') {
    return { ok: false, reason: FAILURE_REASONS[response.status] }
  }

  const segments = (response.commands ?? []).filter(
    (segment) => segment.length > 0,
  )
  if (segments.length === 0) {
    return { ok: false, reason: 'The command contains nothing to run.' }
  }

  const parsed: ParsedCommand = {
    segments,
    sawSubstitution: response.hasSubstitution === true,
    sawRedirection: response.hasRedirection === true,
    // Anything the AST could not reduce to plain words came back as
    // `unsupported`, so a lowered command is faithful by construction.
    tokensAreFaithful: true,
  }
  return { ok: true, parsed }
}

export function shutdownPowerShellParsers(): void {
  for (const process of processes.values()) process.kill()
  processes.clear()
}
