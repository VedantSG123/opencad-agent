import os from 'node:os'

import { findPowerShell } from './parse/powershell'

export type ShellInvocation = {
  executable: string
  /** The flags that make the shell read the command as its next argument. */
  argsPrefix: string[]
}

/**
 * On Windows, `bash` on PATH is usually System32's WSL launcher rather than a
 * shell, so the one to use is pinned by environment variable the way ripgrep's
 * path is.
 */
export function resolveBashPath(): string {
  return process.env.OPENCAD_BASH_PATH || 'bash'
}

/**
 * The shell a command will be handed to. It must be the same one the policy
 * layer parsed with - parsing under PowerShell 7 and running under Windows
 * PowerShell 5.1 would let the two disagree about what the command says.
 */
export function resolveShell(): ShellInvocation | null {
  if (os.platform() !== 'win32') {
    return { executable: resolveBashPath(), argsPrefix: ['-c'] }
  }

  const powershell = findPowerShell()
  if (powershell === null) return null

  return {
    executable: powershell,
    // -NonInteractive so a cmdlet that wants input fails instead of hanging.
    argsPrefix: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'],
  }
}

/**
 * Nothing here changes what a command may do - the policy layer decides that.
 * These only stop a command from sitting forever waiting for a person: git and
 * ssh will happily block on a credential prompt, and a pager will block on a
 * keypress that is never coming.
 */
export function hardenedEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    GCM_INTERACTIVE: 'never',
    PAGER: 'cat',
    GIT_PAGER: 'cat',
  }
}
