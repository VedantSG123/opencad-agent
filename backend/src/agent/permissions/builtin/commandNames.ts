/**
 * How a program token is read when classifying a command.
 *
 * The two lists pull in opposite directions on purpose. Deciding something is
 * dangerous should see through `/bin/rm` and `RM.EXE`, so that comparison
 * strips the path and the case. Deciding something is safe must not, because
 * `/tmp/evil/ls` is not `ls` - so the safe list only ever considers a bare
 * name. Both mistakes then land on asking the user.
 */
export function programIdentity(token: string): string {
  const parts = token.split(/[/\\]/).filter(Boolean)
  const base = parts[parts.length - 1] ?? ''
  return base.toLowerCase().replace(/\.exe$/, '')
}

export function isBareProgramName(token: string): boolean {
  return !token.includes('/') && !token.includes('\\')
}

/** PowerShell matches cmdlet and parameter names without regard to case. */
export function hasFlag(
  tokens: readonly string[],
  ...flags: string[]
): boolean {
  const wanted = new Set(flags.map((flag) => flag.toLowerCase()))
  return tokens.some((token) => wanted.has(token.toLowerCase()))
}

/** Catches `-rf` and `-fr` as well as a separate `-r` and `-f`. */
export function hasShortFlag(
  tokens: readonly string[],
  letter: string,
): boolean {
  return tokens.some(
    (token) => /^-[a-zA-Z]+$/.test(token) && token.slice(1).includes(letter),
  )
}

/** Global flags that git reads before the subcommand, taking a separate value. */
const GIT_VALUE_FLAGS = new Set([
  '-C',
  '-c',
  '--config-env',
  '--exec-path',
  '--git-dir',
  '--namespace',
  '--super-prefix',
  '--work-tree',
])

/**
 * The subcommand in a git invocation, skipping the global flags that come
 * before it. Without this, `git -C /tmp push` reads as the subcommand `/tmp`.
 */
export function gitSubcommand(args: readonly string[]): string | undefined {
  let index = 0
  while (index < args.length) {
    const arg = args[index]
    if (arg === undefined) return undefined

    if (GIT_VALUE_FLAGS.has(arg)) {
      index += 2
      continue
    }
    if (arg.startsWith('-')) {
      index += 1
      continue
    }
    return arg
  }
  return undefined
}
