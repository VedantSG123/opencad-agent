import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { tool } from 'ai'
import { buildOptionsSchema } from 'shared'
import type { BuildOptions, BuildReport, BuildRequest } from 'shared'

import { logger } from '../../../utils/logger'
import { formatBuildReport } from './formatResult'
import { prompt } from './prompt'

/**
 * Puts a build to whoever is driving the run. The app owns kernel execution,
 * so the backend can only ask and wait.
 */
export type BuildRequester = (
  request: BuildRequest,
  toolCallId: string,
) => Promise<BuildReport>

export type BuildToolContext = {
  workingDirectory: string
  /**
   * As the project stores it - absolute for a project the app created,
   * relative to `workingDirectory` otherwise - or `null` when it has none.
   */
  mainFile: string | null
  requestBuild: BuildRequester
}

export const buildInputSchema = buildOptionsSchema

export function createBuildTool(context: BuildToolContext) {
  return tool({
    description: prompt,
    inputSchema: buildInputSchema,
    execute: async (input, options): Promise<string> => {
      try {
        return await build(context, options.toolCallId, input)
      } catch (error) {
        logger.error({ error }, 'build tool failed')
        return `Error building: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export async function build(
  context: BuildToolContext,
  toolCallId: string,
  options: BuildOptions = {},
): Promise<string> {
  if (context.mainFile === null) {
    return 'Error: this project has no main file set, so there is nothing to build. Ask the user to choose one.'
  }

  const absolutePath = path.resolve(context.workingDirectory, context.mainFile)
  const file = path
    .relative(context.workingDirectory, absolutePath)
    .split(path.sep)
    .join('/')
  let source: string
  try {
    source = await readFile(absolutePath, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return `Error: the main file ${file} does not exist.`
    }
    throw error
  }

  const request: BuildRequest = { file, source, ...options }
  return formatBuildReport(
    request,
    await context.requestBuild(request, toolCallId),
  )
}
