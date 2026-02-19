import type { ApiDocEntityType } from './generateApiDocsChunks'
import path from 'path'

const entityTypeMap: Record<string, ApiDocEntityType> = {
  'classes/': 'class',
  'functions/': 'function',
  'interfaces/': 'interface',
  'type-aliases/': 'type-alias',
  'variables/': 'variable',
}

type ApiDoc = {
  contentUrl: string
  entityType: ApiDocEntityType
  entityName: string
  source: string
}

const REPLICAD_API_DOCS_BASE_URL = 'https://replicad.xyz/docs/api'
const REMOTE_API_DOCS_BASE_URL =
  'https://raw.githubusercontent.com/VedantSG123/replicad-api-docs/refs/heads/main'

export const getIndexDoc = async () => {
  const response = await fetch(`${REMOTE_API_DOCS_BASE_URL}/index.md`)

  if (!response.ok) {
    throw new Error(
      `Failed to fetch index markdown: ${response.status} ${response.statusText}`,
    )
  }

  return response.text()
}

export const getApiDocList = async () => {
  const indexMarkdown = await getIndexDoc()
  const regex = /\(([^)]+\.md)\)/g
  const matches = indexMarkdown.match(regex) || []

  const results: ApiDoc[] = []

  for (const match of matches) {
    const relativePath = match.slice(1, -1) // Remove parentheses

    for (const [key, entityType] of Object.entries(entityTypeMap)) {
      if (relativePath.startsWith(key)) {
        const entityName = path.basename(relativePath, '.md')

        results.push({
          contentUrl: `${REMOTE_API_DOCS_BASE_URL}/${relativePath}`,
          entityType,
          entityName,
          source: `${REPLICAD_API_DOCS_BASE_URL}/${relativePath}`,
        })
        break
      }
    }
  }
  return results
}
