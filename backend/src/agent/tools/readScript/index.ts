import { tool } from 'ai'
import { z } from 'zod'

import { getScriptContent } from './getScriptContent.js'

export const readScript = tool({
  description:
    'Read the current Replicad script file. This tool retrieves the code content from the replicad.js file so you can analyze and understand the current implementation before making changes.',
  inputSchema: z.object({}),
  execute: async (): Promise<string> => {
    try {
      const content = await getScriptContent()
      return content
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  },
})
