import os from 'node:os'

import { parsePosixCommand } from './posix'
import { parsePowerShellCommand } from './powershell'
import type { ParseResult } from './types'

export type { ParsedCommand, ParseResult } from './types'

/** Whichever shell the tool would hand this command to is the one that reads it. */
export async function parseCommand(command: string): Promise<ParseResult> {
  return os.platform() === 'win32'
    ? parsePowerShellCommand(command)
    : parsePosixCommand(command)
}
