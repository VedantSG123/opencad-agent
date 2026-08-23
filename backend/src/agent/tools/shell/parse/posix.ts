import { spawnSync } from 'node:child_process'

import { type ParseEntry, parse } from 'shell-quote'

import type { ParsedCommand, ParseResult } from './types'

const SEGMENT_OPERATORS = new Set(['&&', '||', ';', ';;', '|', '|&', '&'])

const SYNTAX_CHECK_TIMEOUT_MS = 5000

/**
 * Syntax-checks with bash itself. shell-quote accepts malformed input without
 * complaint - `echo 'foo` tokenizes as `echo foo` - so it cannot tell us when
 * its own output is untrustworthy, and only the real shell can.
 *
 * The command travels as an argv entry, never inside a shell string, so it
 * cannot escape into the check itself.
 */
export function posixSyntaxError(command: string): string | null {
  // On Windows, PATH's `bash` is often the WSL launcher rather than a real
  // shell; OPENCAD_BASH_PATH pins the one to use, mirroring OPENCAD_RIPGREP_PATH.
  const bash = process.env.OPENCAD_BASH_PATH || 'bash'
  const result = spawnSync(bash, ['-n', '-c', command], {
    encoding: 'utf-8',
    timeout: SYNTAX_CHECK_TIMEOUT_MS,
  })

  if (result.error) {
    return `bash could not be run to check this command: ${result.error.message}`
  }
  if (result.status !== 0) {
    const detail = (result.stderr || '').trim().split('\n')[0]
    return detail || 'The command is not valid shell syntax.'
  }

  return null
}

/**
 * Quoting is stripped by shell-quote, so a literal `$(` inside single quotes
 * reads the same as a live substitution. Both are reported: the cost is a
 * needless refusal on `echo '$(x)'`, and no real substitution slips through.
 */
function containsSubstitution(token: string): boolean {
  return token.includes('$(') || token.includes('`')
}

export function tokenizePosixCommand(command: string): ParsedCommand {
  const entries: ParseEntry[] = parse(command, (key: string) => `$${key}`)

  const segments: string[][] = []
  let current: string[] = []
  let sawSubstitution = false
  let sawRedirection = false
  let sawHeredoc = false
  let previousWasDollar = false
  let previousWasLessThan = false

  const endSegment = (): void => {
    if (current.length > 0) segments.push(current)
    current = []
  }

  for (const entry of entries) {
    if (typeof entry === 'string') {
      if (containsSubstitution(entry)) sawSubstitution = true
      current.push(entry)
      previousWasDollar = entry === '$'
      previousWasLessThan = false
      continue
    }

    if ('comment' in entry) continue

    if (entry.op === 'glob') {
      current.push(entry.pattern)
      previousWasDollar = false
      previousWasLessThan = false
      continue
    }

    const { op } = entry
    if (op === '(' && previousWasDollar) {
      sawSubstitution = true
      current.pop()
    } else if (op.endsWith('(')) {
      sawSubstitution = true
    } else if (op.includes('<') || op.includes('>')) {
      sawRedirection = true
      if (op === '<' && previousWasLessThan) sawHeredoc = true
    } else if (SEGMENT_OPERATORS.has(op)) {
      endSegment()
    }
    previousWasDollar = false
    previousWasLessThan = op === '<'
  }

  endSegment()

  const startsWithAssignment = segments.some((segment) =>
    segment[0]?.includes('='),
  )

  return {
    segments,
    sawSubstitution,
    sawRedirection,
    tokensAreFaithful: !sawHeredoc && !startsWithAssignment,
  }
}

export function parsePosixCommand(command: string): ParseResult {
  if (command.trim() === '') {
    return { ok: false, reason: 'The command is empty.' }
  }

  const syntaxError = posixSyntaxError(command)
  if (syntaxError) {
    return { ok: false, reason: syntaxError }
  }

  const parsed = tokenizePosixCommand(command)
  if (parsed.segments.length === 0) {
    return { ok: false, reason: 'The command contains nothing to run.' }
  }

  return { ok: true, parsed }
}
