import { gitSubcommand, hasFlag, isBareProgramName } from './commandNames'

/**
 * Commands that only read, and may run without asking. Membership is decided
 * on the bare program name: `/tmp/evil/ls` is not `ls`, and nothing here is
 * worth auto-allowing an arbitrary binary for.
 *
 * Several entries are safe only for some arguments - `find` can run a program,
 * `rg` can be pointed at a preprocessor - so those get a check of their own
 * rather than a place in the set.
 */
export function isKnownSafeCommand(tokens: readonly string[]): boolean {
  const program = tokens[0]
  if (program === undefined || !isBareProgramName(program)) return false

  const identity = program.toLowerCase()
  const args = tokens.slice(1)

  if (READ_ONLY.has(identity)) return true

  if (identity === 'git') return gitIsReadOnly(args)
  if (identity === 'find') return findIsReadOnly(args)
  if (identity === 'rg' || identity === 'grep') return searchIsReadOnly(args)

  return false
}

const READ_ONLY = new Set([
  // POSIX
  'basename',
  'cat',
  'cksum',
  'cmp',
  'comm',
  'date',
  'diff',
  'dirname',
  'du',
  'df',
  'echo',
  'file',
  'head',
  'hostname',
  'id',
  'ls',
  'md5sum',
  'nl',
  'pwd',
  'realpath',
  'sha1sum',
  'sha256sum',
  'sort',
  'stat',
  'tail',
  'tree',
  'uname',
  'uniq',
  'wc',
  'which',
  'whoami',
  // PowerShell, matched lowercase because it ignores case itself
  'get-childitem',
  'get-command',
  'get-content',
  'get-date',
  'get-item',
  'get-location',
  'measure-object',
  'resolve-path',
  'select-object',
  'select-string',
  'test-path',
  'write-output',
])

/** Global flags that let git run a program or load foreign configuration. */
const GIT_UNSAFE_GLOBAL_FLAGS = [
  '-c',
  '--config-env',
  '--exec-path',
  '--upload-pack',
]

const GIT_READ_ONLY_SUBCOMMANDS = new Set([
  'blame',
  'branch',
  'diff',
  'log',
  'show',
  'status',
  'tag',
])

function gitIsReadOnly(args: readonly string[]): boolean {
  if (
    args.some((arg) =>
      GIT_UNSAFE_GLOBAL_FLAGS.some(
        (flag) => arg === flag || arg.startsWith(`${flag}=`),
      ),
    )
  ) {
    return false
  }

  const subcommand = gitSubcommand(args)
  if (subcommand === undefined || !GIT_READ_ONLY_SUBCOMMANDS.has(subcommand)) {
    return false
  }

  // `git branch -d` and `git tag -d` delete; the rest of these only report.
  if (
    (subcommand === 'branch' || subcommand === 'tag') &&
    hasFlag(args, '-d', '-D', '--delete', '-m', '-M', '--move', '-f', '--force')
  ) {
    return false
  }

  return !hasFlag(args, '--output', '-o')
}

/** Flags that turn find from a search into an execution or a deletion. */
const FIND_UNSAFE_FLAGS = [
  '-delete',
  '-exec',
  '-execdir',
  '-fls',
  '-fprint',
  '-fprintf',
  '-ok',
  '-okdir',
]

function findIsReadOnly(args: readonly string[]): boolean {
  return !args.some((arg) => FIND_UNSAFE_FLAGS.includes(arg.toLowerCase()))
}

/** Flags that hand ripgrep or grep a program to run, or a file to write. */
const SEARCH_UNSAFE_FLAGS = ['--pre', '--hostname-bin', '-f', '--file']

function searchIsReadOnly(args: readonly string[]): boolean {
  return !args.some((arg) =>
    SEARCH_UNSAFE_FLAGS.some(
      (flag) => arg === flag || arg.startsWith(`${flag}=`),
    ),
  )
}
