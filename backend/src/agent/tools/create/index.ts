import { mkdir, open, writeFile } from 'node:fs/promises'
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

  const { destination } = resolved
  const written =
    destination.kind === 'empty-file'
      ? await fillEmptyFile(resolved.absolutePath, input.content)
      : await writeNewFile(
          resolved.absolutePath,
          input.content,
          destination.missingDirectory !== null,
        )
  if (!written) {
    return `Error: ${resolved.displayPath} already exists and is not empty. Create only makes a new file or fills an empty one - read it and use edit to change it.`
  }

  return formatCreateResult({
    displayPath: resolved.displayPath,
    content: input.content,
    destination,
  })
}

/** `false` when the path was taken between the check and the write. */
async function writeNewFile(
  absolutePath: string,
  content: string,
  makeDirectories: boolean,
): Promise<boolean> {
  if (makeDirectories) {
    await mkdir(path.dirname(absolutePath), { recursive: true })
  }

  try {
    // `wx` fails if the path is taken. The check in `resolveCreatePath` read
    // the filesystem a moment earlier; only the open itself is decisive, and
    // this is the difference between reporting a clash and overwriting a file.
    await writeFile(absolutePath, content, { encoding: 'utf-8', flag: 'wx' })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
}

/**
 * `false` when the file gained content since it was checked. The size is read
 * from the open handle, so it describes the very file being written.
 */
async function fillEmptyFile(
  absolutePath: string,
  content: string,
): Promise<boolean> {
  const handle = await open(absolutePath, 'r+')
  try {
    if ((await handle.stat()).size !== 0) return false
    await handle.writeFile(content, 'utf-8')
    return true
  } finally {
    await handle.close()
  }
}
