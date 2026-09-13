import {
  gitSubcommand,
  hasFlag,
  hasShortFlag,
  programIdentity,
} from './commandNames'

/**
 * Commands whose damage is hard to undo. A match forces the question back to
 * the user even when a stored rule would have allowed the command, so a broad
 * grant on `git` never quietly covers `git push --force`.
 *
 * The program is matched through its path and case, because `/bin/rm` and
 * `RM.EXE` destroy just as much as `rm`.
 */
export function dangerousCommandReason(
  tokens: readonly string[],
): string | null {
  const program = tokens[0]
  if (program === undefined) return null

  const identity = programIdentity(program)
  const args = tokens.slice(1)

  if (ALWAYS_DANGEROUS.has(identity)) {
    return `"${identity}" can destroy data or the machine it runs on`
  }

  if (identity === 'rm' || identity === 'del' || identity === 'erase') {
    return recursiveOrForcedRemovalReason(args)
  }
  if (identity === 'remove-item' || identity === 'ri') {
    return removeItemReason(args)
  }
  if (identity === 'git') {
    return gitReason(args)
  }
  if (identity === 'chmod' || identity === 'chown' || identity === 'icacls') {
    return permissionChangeReason(args)
  }
  if (identity === 'kill' || identity === 'pkill' || identity === 'killall') {
    return killReason(args)
  }

  return null
}

const ALWAYS_DANGEROUS = new Set([
  'clear-disk',
  'dd',
  'diskpart',
  'fdisk',
  'format',
  'format-volume',
  'halt',
  'initialize-disk',
  'mkfs',
  'poweroff',
  'reboot',
  'restart-computer',
  'shred',
  'shutdown',
  'stop-computer',
  'takeown',
  'wipefs',
])

function recursiveOrForcedRemovalReason(
  args: readonly string[],
): string | null {
  const recursive = hasShortFlag(args, 'r') || hasShortFlag(args, 'R')
  const forced = hasShortFlag(args, 'f')
  // cmd.exe spells its switches with a slash and takes /s for recursion.
  const cmdStyle = hasFlag(args, '/s', '/q', '/f')

  if (recursive || forced || cmdStyle) {
    return 'deleting recursively or without prompting cannot be undone'
  }
  return null
}

function removeItemReason(args: readonly string[]): string | null {
  if (hasFlag(args, '-recurse', '-force')) {
    return 'deleting recursively or without prompting cannot be undone'
  }
  return null
}

function gitReason(args: readonly string[]): string | null {
  const subcommand = gitSubcommand(args)

  if (
    subcommand === 'push' &&
    hasFlag(args, '--force', '-f', '--force-if-includes')
  ) {
    return 'a force push can discard commits that are already published'
  }
  if (subcommand === 'reset' && hasFlag(args, '--hard')) {
    return 'a hard reset discards uncommitted work'
  }
  if (subcommand === 'clean' && hasShortFlag(args, 'f')) {
    return 'git clean deletes untracked files outright'
  }
  if (subcommand === 'checkout' && hasFlag(args, '--force', '-f')) {
    return 'a forced checkout discards uncommitted work'
  }
  if (subcommand === 'filter-branch' || subcommand === 'filter-repo') {
    return 'rewriting history changes every commit that follows'
  }
  return null
}

function permissionChangeReason(args: readonly string[]): string | null {
  if (hasShortFlag(args, 'R') || hasFlag(args, '--recursive', '/t')) {
    return 'changing permissions across a tree is easy to get wrong'
  }
  if (args.some((arg) => /^0?777$/.test(arg))) {
    return 'granting full permissions to everyone exposes the files'
  }
  return null
}

function killReason(args: readonly string[]): string | null {
  // `kill -9 -1` signals every process the user owns.
  if (args.includes('-1')) {
    return 'signalling every process would end this session'
  }
  return null
}
