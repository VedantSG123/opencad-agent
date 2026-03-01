import { tool } from 'ai'
import { writeFile } from 'fs/promises'
import { z } from 'zod'

import { SCRIPT_PATH } from '../readScript/getScriptContent.js'

export const writeScript = tool({
  description:
    'Write (overwrite) the entire Replicad script file with new content. This tool replaces ALL existing content in replicad.js with the provided code. Use this when you want to write a complete, self-contained script from scratch rather than making incremental edits via applyDiff.',
  inputSchema: z.object({
    content: z
      .string()
      .describe(
        'The complete JavaScript code to write to the replicad.js file. This will replace all existing content.',
      ),
  }),
  execute: async ({ content }): Promise<string> => {
    try {
      await writeFile(SCRIPT_PATH, content, 'utf-8')
      return `Script written successfully to ${SCRIPT_PATH} (${content.length} characters).`
    } catch (error) {
      return `Error writing script: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  },
})
