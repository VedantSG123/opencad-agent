import { existsSync, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { isWithin } from '../../../utils/paths'
import { programIdentity } from './commandNames'
import { deniedPathReason } from './deniedPaths'

/**
 * What a command would open, read out of its own arguments.
 *
 * The shell tool hands a whole command line to a shell, so layer 2 never sees
 * the individual files the way `read` and `edit` do - this is the only place a
 * command's paths can be weighed at all. Without it the path rules stop at the
 * tools that name a file in their input, and `cat` walks straight past them.
 *
 * The program itself is left out. Whether it may run is what the safe,
 * dangerous and opaque lists already answer.
 */
export function pathArgumentsOf(tokens: readonly string[]): string[] {
  const patternIndex = searchPatternIndex(tokens)
  const candidates: string[] = []

  for (let index = 1; index < tokens.length; index++) {
    if (index === patternIndex) continue

    const token = tokens[index]
    if (token === undefined) continue

    const candidate = pathPartOf(token)
    if (candidate !== null) candidates.push(candidate)
  }

  return candidates
}

/**
 * Why one of a command's arguments names something no grant may open, or
 * `null`.
 *
 * Weighed before any allow rule, exactly as the dangerous list is: a built-in
 * denial is absolute, and a rule naming a program says nothing at all about
 * what the program will be pointed at.
 */
export function deniedPathArgumentReason(
  tokens: readonly string[],
  projectDirectory: string,
): string | null {
  for (const argument of pathArgumentsOf(tokens)) {
    const absolute = resolveArgument(projectDirectory, argument)

    // Not gated on the file being there: `.ssh/authorized_keys` is off limits
    // whether or not it exists yet, and a command that writes would create it.
    const reason = deniedPathReason(absolute)
    if (reason) return `it names ${argument}, and ${reason}`

    // A link can point anywhere, and only the resolved path shows it. The
    // file-level tools check the same thing before they open anything.
    const real = realPathOrNull(absolute)
    if (real !== null && real !== absolute) {
      const realReason = deniedPathReason(real)
      if (realReason) {
        return `it names ${argument}, which leads to ${real}, and ${realReason}`
      }
    }
  }

  return null
}

/**
 * The first argument naming something real outside the project, or `null`.
 *
 * Only paths that exist count. A word resolving to nothing is a word - a
 * regex, a branch, a package name - and a read of it would fail anyway, so
 * treating it as a path would cost the user a question and settle nothing.
 */
export function outsideProjectArgument(
  tokens: readonly string[],
  projectDirectory: string,
): string | null {
  for (const argument of pathArgumentsOf(tokens)) {
    const absolute = resolveArgument(projectDirectory, argument)
    if (!existsSync(absolute)) continue

    if (!isWithin(projectDirectory, absolute)) return argument

    const real = realPathOrNull(absolute)
    if (real !== null && !isWithin(projectDirectory, real)) return argument
  }

  return null
}

/**
 * The path a shell would open for this word, or `null` when the word cannot
 * name one.
 *
 * A flag is skipped, but the value fused onto it with `=` is not, so
 * `--output=../notes.md` is still read as a path. A URL is skipped outright:
 * `https://host/keys.pem` resolves onto a name the policy denies while naming
 * no file at all.
 */
function pathPartOf(token: string): string | null {
  if (token === '') return null

  if (token.startsWith('-')) {
    const fused = token.indexOf('=')
    if (fused === -1) return null

    const value = token.slice(fused + 1)
    return value === '' ? null : pathPartOf(value)
  }

  return /^[a-z][a-z\d+.-]*:\/\//i.test(token) ? null : token
}

/**
 * Both bash and PowerShell expand a leading `~`, so the policy has to read it
 * the same way - otherwise `cat ~/.ssh/id_rsa` is weighed against a path
 * inside the project that nothing will ever open.
 */
function resolveArgument(projectDirectory: string, argument: string): string {
  if (argument === '~') return path.resolve(os.homedir())
  if (argument[0] === '~' && (argument[1] === '/' || argument[1] === path.sep)) {
    return path.resolve(os.homedir(), argument.slice(2))
  }

  return path.resolve(projectDirectory, argument)
}

const SEARCH_PROGRAMS = new Set([
  'egrep',
  'fgrep',
  'grep',
  'rg',
  'select-string',
  'sls',
  'zgrep',
])

/**
 * Which argument is a search pattern rather than a path.
 *
 * `rg "\.env"` names no file, but on Windows the backslash reads as a
 * separator and the token resolves onto a name the policy denies. The first
 * bare word is the pattern, and every path the program is pointed at comes
 * after it - so mistaking a flag's value for the pattern can only cost a check
 * on something that was never a path.
 *
 * `--files` is the exception: it lists files and takes no pattern at all, so
 * there the first bare word is a path like any other.
 */
function searchPatternIndex(tokens: readonly string[]): number | undefined {
  const program = tokens[0]
  if (program === undefined) return undefined
  if (!SEARCH_PROGRAMS.has(programIdentity(program))) return undefined
  if (tokens.some((token) => token.toLowerCase() === '--files')) {
    return undefined
  }

  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index]
    if (token !== undefined && token !== '' && !token.startsWith('-')) {
      return index
    }
  }

  return undefined
}

function realPathOrNull(target: string): string | null {
  try {
    return realpathSync(target)
  } catch {
    return null
  }
}
