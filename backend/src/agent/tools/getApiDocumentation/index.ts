import { tool } from 'ai'
import { z } from 'zod'

import { getChunkById } from '../../../utils/dbUtils/replicadApiDocumentationStore'
import { API_DOC_CHUNK_ENTITY_TYPES } from '../../../utils/knowledge-base/replicad/generateApiDocsChunks'
import '../../../utils/logger'
import { logger } from '../../../utils/logger'

export const getApiDocumentation = tool({
  description:
    'Retrieve detailed API documentation for a specific class, function, method, variable, interface, or type alias. For methods, use the format "ClassName.methodName".',
  inputSchema: z.object({
    entityName: z
      .string()
      .describe(
        'The name of the entity. For classes/functions/variables/interfaces/type-aliases: use the name directly. For methods: use "ClassName.methodName" format.',
      ),
    entityType: z
      .enum(API_DOC_CHUNK_ENTITY_TYPES)
      .describe('The type of the API entity to retrieve documentation for.'),
  }),
  execute: async ({ entityName, entityType }): Promise<string> => {
    try {
      // Construct the chunk ID using the format: type:name
      const chunkId = `${entityType}:${entityName}`

      // Retrieve the chunk from the database
      const chunk = await getChunkById(chunkId)

      if (!chunk) {
        return `No documentation found for ${entityType} "${entityName}". Please verify the name and type are correct.`
      }

      // Return the documentation content
      return chunk.content
    } catch (error) {
      logger.error(
        { error, entityName, entityType },
        'error retrieving API documentation',
      )
      return `Error retrieving documentation for ${entityType} "${entityName}": ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  },
})
