import path from 'node:path'

import { tool } from 'ai'
import { z } from 'zod'

import { logger } from '../../../utils/logger'
import { projectPathGuard } from '../../permissions/pathGuard'
import type { ToolContext } from '../types'
import { formatReadResult } from './formatResult'
import { prompt } from './prompt'
import { readWindow } from './readWindow'
import { isDirectory, resolveFilePath } from './resolveFilePath'

const DEFAULT_LINE_LIMIT = 500
const MAX_LINE_LIMIT = 2000
const MAX_LINE_CHARS = 2000
const MAX_OUTPUT_CHARS = 60_000
const MAX_SCAN_BYTES = 16 * 1024 * 1024

const BINARY_EXTENSIONS = new Set([
  '.3mf',
  '.7z',
  '.avif',
  '.bin',
  '.blend',
  '.bmp',
  '.bz2',
  '.class',
  '.db',
  '.dll',
  '.dylib',
  '.eot',
  '.exe',
  '.fcstd',
  '.flac',
  '.gif',
  '.glb',
  '.gz',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp3',
  '.mp4',
  '.node',
  '.odt',
  '.ogg',
  '.otf',
  '.pdf',
  '.png',
  '.pyc',
  '.rar',
  '.so',
  '.sqlite',
  '.tar',
  '.tgz',
  '.tif',
  '.tiff',
  '.ttf',
  '.wasm',
  '.wav',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.xz',
  '.zip',
])

// Every field is optional rather than defaulted: some providers reject JSON
// Schema `default` keywords in tool definitions, so defaults are applied below.
export const readInputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      'File to read, relative to the project directory, e.g. "src/index.ts".',
    ),
  offset: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Line to start at, 1-based. Defaults to the first line.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LINE_LIMIT)
    .optional()
    .describe(
      `Maximum number of lines to return. Defaults to ${DEFAULT_LINE_LIMIT}.`,
    ),
})

export type ReadInput = z.infer<typeof readInputSchema>

export function createReadTool(context: ToolContext) {
  return tool({
    description: prompt,
    inputSchema: readInputSchema,
    execute: async (input, options): Promise<string> => {
      try {
        return await read(
          input,
          context,
          options?.abortSignal,
          options?.toolCallId,
        )
      } catch (error) {
        logger.error({ error, input }, 'read tool failed')
        return `Error reading file: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export async function read(
  input: ReadInput,
  context: ToolContext,
  abortSignal: AbortSignal | undefined,
  toolCallId?: string,
): Promise<string> {
  const offset = input.offset ?? 1
  const limit = Math.min(input.limit ?? DEFAULT_LINE_LIMIT, MAX_LINE_LIMIT)

  const root = path.resolve(context.workingDirectory)
  if (!(await isDirectory(root))) {
    return `Error: the project directory "${root}" does not exist or is not a directory.`
  }

  const guard = context.permissions ?? projectPathGuard(root)
  const resolved = await resolveFilePath(root, input.path, guard, toolCallId)
  if ('error' in resolved) return resolved.error

  const extension = path.extname(resolved.displayPath).toLowerCase()
  if (BINARY_EXTENSIONS.has(extension)) {
    return `Error: ${resolved.displayPath} is a binary file ("${extension}") and cannot be read as text.`
  }

  if (resolved.sizeBytes === 0) {
    return `${resolved.displayPath} is empty.`
  }

  const window = await readWindow({
    absolutePath: resolved.absolutePath,
    offset,
    limit,
    maxLineChars: MAX_LINE_CHARS,
    maxOutputChars: MAX_OUTPUT_CHARS,
    maxScanBytes: MAX_SCAN_BYTES,
    abortSignal,
  })

  if (window.isBinary) {
    return `Error: ${resolved.displayPath} contains null bytes, so it is a binary file and cannot be read as text.`
  }

  return formatReadResult({
    displayPath: resolved.displayPath,
    sizeBytes: resolved.sizeBytes,
    window,
    maxLineChars: MAX_LINE_CHARS,
    maxOutputChars: MAX_OUTPUT_CHARS,
    maxScanBytes: MAX_SCAN_BYTES,
  })
}
