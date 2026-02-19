import {
  clearStore,
  insertChunk,
} from '../../dbUtils/replicadApiDocumentationStore'
import { getApiDocList } from './getApiDocList'
import { generateApiDocsChunks } from './generateApiDocsChunks'

const getApiDocs = async () => {
  const docList = await getApiDocList()

  const docs = await Promise.all(
    docList.map(async (doc) => {
      const response = await fetch(doc.contentUrl)

      if (!response.ok) {
        throw new Error(
          `Failed to fetch API doc content for ${doc.entityName}: ${response.status} ${response.statusText}`,
        )
      }

      const content = await response.text()

      return {
        ...doc,
        content,
      }
    }),
  )

  return docs
}

const getApiDocsChunks = async () => {
  const docs = await getApiDocs()

  const allChunks = docs.flatMap((doc) =>
    generateApiDocsChunks(doc.content, doc.entityType, doc.entityName).map(
      (chunk) => ({
        ...chunk,
        metadata: chunk.metadata || null,
        source: doc.source,
      }),
    ),
  )

  return allChunks
}

export const createApiDocsKnowledge = async () => {
  const chunks = await getApiDocsChunks()

  clearStore()

  for (const chunk of chunks) {
    insertChunk(chunk)
  }
}

createApiDocsKnowledge()
