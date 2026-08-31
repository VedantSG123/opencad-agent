import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { tool } from 'ai'
import { z } from 'zod'

import { logger } from '../../../utils/logger'
import { projectPathGuard } from '../../permissions/pathGuard'
import type { ToolContext } from '../types'
import { formatCreateResult } from './formatResult'
import { prompt } from './prompt'
import { resolveCreatePath } from './resolveCreatePath'

export const createInputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      'File to create, relative to the project directory, e.g. "src/bracket.scad".',
    ),
  content: z
    .string()
    .describe(
      'The complete contents of the new file, written exactly as given.',
    ),
})

export type CreateInput = z.infer<typeof createInputSchema>

export function createCreateTool(context: ToolContext) {
  return tool({
    description: prompt,
    inputSchema: createInputSchema,
    execute: async (input, options): Promise<string> => {
      try {
        return await create(
          input,
          context,
          options?.abortSignal,
          options?.toolCallId,
        )
      } catch (error) {
        logger.error({ error, input }, 'create tool failed')
        return `Error creating file: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export async function create(
  input: CreateInput,
  context: ToolContext,
  abortSignal: AbortSignal | undefined,
  toolCallId?: string,
): Promise<string> {
  const root = path.resolve(context.workingDirectory)
  const guard = context.permissions ?? projectPathGuard(root)
  const resolved = await resolveCreatePath(root, input.path, guard, toolCallId)
  if ('error' in resolved) return resolved.error

  // Nothing has been created yet, so a cancelled call leaves the project as it
  // was rather than with an empty directory in it.
  abortSignal?.throwIfAborted()

  if (resolved.missingDirectory !== null) {
    await mkdir(path.dirname(resolved.absolutePath), { recursive: true })
  }

  try {
    // `wx` fails if the path is taken. The check in `resolveCreatePath` read
    // the filesystem a moment earlier; only the open itself is decisive, and
    // this is the difference between reporting a clash and overwriting a file.
    await writeFile(resolved.absolutePath, input.content, {
      encoding: 'utf-8',
      flag: 'wx',
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return `Error: ${resolved.displayPath} already exists. Create only makes a new file - read it and use edit to change it.`
    }
    throw error
  }

  return formatCreateResult({
    displayPath: resolved.displayPath,
    content: input.content,
    createdDirectory: resolved.missingDirectory,
  })
}
