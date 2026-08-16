import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { tool } from 'ai'
import { z } from 'zod'

import { logger } from '../../../utils/logger'
import { projectPathGuard } from '../../permissions/pathGuard'
import type { ToolContext } from '../types'
import { applyReplacements } from './applyReplacements'
import { formatEditResult } from './formatResult'
import { NO_REPLACEMENTS_ERROR, parseReplacements } from './parseReplacements'
import { prompt } from './prompt'
import { resolveEditPath } from './resolveEditPath'
import { validateDiffBlock } from './validateDiffBlock'

// Matching is O(file x search block) over the whole file, and the result is
// held in memory twice over. Well past any hand-written source file.
const MAX_EDIT_BYTES = 8 * 1024 * 1024

export const editInputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      'File to edit, relative to the project directory, e.g. "src/parts.scad".',
    ),
  diff: z
    .string()
    .min(1)
    .describe(
      'One or more SEARCH/REPLACE blocks describing the changes to make.',
    ),
})

export type EditInput = z.infer<typeof editInputSchema>

export function createEditTool(context: ToolContext) {
  return tool({
    description: prompt,
    inputSchema: editInputSchema,
    execute: async (input, options): Promise<string> => {
      try {
        return await edit(
          input,
          context,
          options?.abortSignal,
          options?.toolCallId,
        )
      } catch (error) {
        logger.error({ error, input }, 'edit tool failed')
        return `Error editing file: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export async function edit(
  input: EditInput,
  context: ToolContext,
  abortSignal: AbortSignal | undefined,
  toolCallId?: string,
): Promise<string> {
  const validation = validateDiffBlock(input.diff)
  if (!validation.success) {
    return `Error: ${validation.error}`
  }

  const replacements = parseReplacements(input.diff)
  if (replacements.length === 0) {
    return `Error: ${NO_REPLACEMENTS_ERROR}`
  }

  const root = path.resolve(context.workingDirectory)
  const guard = context.permissions ?? projectPathGuard(root)
  const resolved = await resolveEditPath(root, input.path, guard, toolCallId)
  if ('error' in resolved) return resolved.error

  if (resolved.sizeBytes > MAX_EDIT_BYTES) {
    return `Error: ${resolved.displayPath} is ${resolved.sizeBytes} bytes, past the ${MAX_EDIT_BYTES} byte limit for editing.`
  }

  const originalContent = await readFile(resolved.absolutePath, 'utf-8')
  const result = applyReplacements(originalContent, replacements)

  if (result.appliedCount > 0) {
    // Nothing has been written yet, so a cancelled call leaves the file alone
    // rather than half-edited.
    abortSignal?.throwIfAborted()
    await writeFile(resolved.absolutePath, result.content, 'utf-8')
  }

  return formatEditResult({
    displayPath: resolved.displayPath,
    appliedCount: result.appliedCount,
    totalCount: replacements.length,
    failures: result.failures,
    linesBefore: countLines(originalContent),
    linesAfter: countLines(result.content),
  })
}

function countLines(content: string): number {
  return content === '' ? 0 : content.split(/\r?\n/).length
}
