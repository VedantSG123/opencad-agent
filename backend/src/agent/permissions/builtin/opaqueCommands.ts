import { programIdentity } from './commandNames'

/**
 * Programs that pass whatever follows to something else. A rule naming one of
 * these is a standing grant for whatever it is handed, and a subcommand does
 * not narrow that: `sudo apt` still grants privilege, `env FOO=bar` names no
 * program at all.
 */
const ALWAYS_OPAQUE = new Set([
  // Shells
  'ash',
  'bash',
  'cmd',
  'csh',
  'dash',
  'fish',
  'ksh',
  'powershell',
  'pwsh',
  'sh',
  'tcsh',
  'zsh',
  // Launchers and wrappers
  'doas',
  'env',
  'exec',
  'gdb',
  'ltrace',
  'nice',
  'nohup',
  'open',
  'osascript',
  'setsid',
  'ssh',
  'start',
  'strace',
  'su',
  'sudo',
  'time',
  'timeout',
  'watch',
  'xargs',
  // PowerShell verbs that evaluate a string or start a separate process
  'icm',
  'iex',
  'invoke-command',
  'invoke-expression',
  'invoke-item',
  'saps',
  'start-job',
  'start-process',
  'start-threadjob',
])

/**
 * Runtimes that execute inline code when handed a flag, but are ordinary
 * command-line tools when handed a subcommand. `bun` alone would cover
 * `bun -e <anything>`; `bun add` cannot, because the words no longer match.
 */
const OPAQUE_ALONE = new Set([
  'bun',
  'deno',
  'lua',
  'node',
  'npx',
  'perl',
  'php',
  'py',
  'pypy',
  'pypy3',
  'python',
  'python3',
  'pythonw',
  'ruby',
  'tclsh',
])

/**
 * Whether a stored rule may never be built from these words, though the user
 * may still approve the command once or exactly as written.
 *
 * This weighs the head a grant would record rather than the command that was
 * run: `node script.js` yields the head `node`, which would go on to cover
 * `node -e <anything>`, so it is refused even though the command itself is
 * unremarkable.
 */
export function isOpaqueHead(head: readonly string[]): boolean {
  const program = head[0]
  if (program === undefined) return true

  const identity = programIdentity(program)
  if (ALWAYS_OPAQUE.has(identity)) return true

  return head.length < 2 && OPAQUE_ALONE.has(identity)
}
