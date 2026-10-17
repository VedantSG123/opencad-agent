import path from 'node:path'

import { tool } from 'ai'
import { z } from 'zod'

import { logger } from '../../../utils/logger'
import type { ToolContext } from '../types'
import { formatResult } from './formatResult'
import { prompt } from './prompt'
import { runCommand } from './runCommand'

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_TIMEOUT_MS = 600_000
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024

// Every field is optional rather than defaulted, matching the other tools:
// some providers reject JSON Schema `default` keywords in tool definitions.
export const shellInputSchema = z.object({
  command: z
    .string()
    .min(1)
    .describe(
      'The command to run, written for PowerShell on Windows or bash elsewhere.',
    ),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(MAX_TIMEOUT_MS)
    .optional()
    .describe(
      'How long to let the command run before stopping it. Defaults to 120000.',
    ),
})

export type ShellInput = z.infer<typeof shellInputSchema>

export function createShellTool(context: ToolContext) {
  return tool({
    description: prompt,
    inputSchema: shellInputSchema,
    execute: async (input, options): Promise<string> => {
      try {
        return await shell(input, context, options?.abortSignal)
      } catch (error) {
        logger.error({ error, input }, 'shell tool failed')
        return `Error running command: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

/**
 * Runs a command that the policy layer has already weighed. Nothing here
 * re-checks it: by the time a tool executes, approval has been settled, and a
 * second opinion formed from a different reading of the same words would only
 * be a way for the two to disagree.
 */
export async function shell(
  input: ShellInput,
  context: ToolContext,
  abortSignal?: AbortSignal,
): Promise<string> {
  const run = await runCommand({
    command: input.command,
    cwd: path.resolve(context.workingDirectory),
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBytes: MAX_OUTPUT_BYTES,
    abortSignal,
  })

  return formatResult(input.command, run)
}
