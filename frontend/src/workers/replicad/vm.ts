/* eslint-disable @typescript-eslint/no-implied-eval */

import { parse } from 'acorn'

/** Names the sandboxed code in stack traces, apart from replicad's own frames. */
const SANDBOX_SOURCE_URL = 'opencad-model.js'

/**
 * V8 compiles `new Function(arg, body)` as `function anonymous(arg\n) {\n`
 * followed by the body, so the body starts on line 3. The prologue takes one
 * more line.
 */
const FIRST_CODE_LINE = 4

const SANDBOX_FRAME = new RegExp(`${SANDBOX_SOURCE_URL}:(\\d+):(\\d+)`)

export type SourceLocation = { line: number; column: number }

export function runFunctionWithContext<
  T extends Record<string, unknown>,
  R = unknown,
>(code: string, context: T): R {
  const prologue = Object.keys(context)
    .map((k) => `let ${k} = context['${k}'];`)
    .join(' ')

  const fn = new Function(
    'context',
    `"use strict"; ${prologue}\n${code}\n//# sourceURL=${SANDBOX_SOURCE_URL}`,
  ) as (ctx: T) => R

  return fn(context)
}

/**
 * Where the innermost sandbox frame of `stack` points, counted in the `code`
 * that was run. `null` for an error thrown before the code ran (a syntax
 * error) or from outside it.
 */
export function sandboxLocation(
  stack: string | undefined,
): SourceLocation | null {
  const match = stack?.match(SANDBOX_FRAME)
  if (!match) return null

  const line = Number(match[1]) - FIRST_CODE_LINE + 1
  return line >= 1 ? { line, column: Number(match[2]) } : null
}

/**
 * Where acorn stops parsing `code`, for a `SyntaxError` V8 raised. V8 gives no
 * position for one thrown by `new Function`, so a second parser has to find
 * it. `null` when acorn accepts the code: the error was then in the code
 * wrapped around it, not in the user's.
 */
export function syntaxErrorLocation(code: string): SourceLocation | null {
  try {
    // A top-level `return` is legal here, since the code runs as a function body.
    parse(code, { ecmaVersion: 'latest', allowReturnOutsideFunction: true })
    return null
  } catch (error) {
    if (!hasAcornLocation(error)) return null
    // acorn's columns are 0-based; V8's stack columns are 1-based.
    return { line: error.loc.line, column: error.loc.column + 1 }
  }
}

/** acorn's typings do not describe the error it throws, only its parse tree. */
function hasAcornLocation(
  error: unknown,
): error is SyntaxError & { loc: { line: number; column: number } } {
  if (!(error instanceof SyntaxError) || !('loc' in error)) return false
  const { loc } = error
  return (
    typeof loc === 'object' &&
    loc !== null &&
    'line' in loc &&
    typeof loc.line === 'number' &&
    'column' in loc &&
    typeof loc.column === 'number'
  )
}
