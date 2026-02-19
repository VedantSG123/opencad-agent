import { db } from '../../db'

export const insertChunk = (chunk: ReplicadApiDocumentationChunk) => {
  const stmt = db.prepare(`
    INSERT INTO replicad_api_documentation_store (
      id,
      name,
      source,
      content,
      type,
      metadata
    ) VALUES (
      $id,
      $name,
      $source,
      $content,
      $type,
      $metadata
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      source = excluded.source,
      content = excluded.content,
      type = excluded.type,
      metadata = excluded.metadata,
      updated_at = CURRENT_TIMESTAMP
  `)

  stmt.run({
    $id: chunk.id,
    $name: chunk.name,
    $source: chunk.source,
    $content: chunk.content,
    $type: chunk.type,
    $metadata: chunk.metadata ? JSON.stringify(chunk.metadata) : null,
  })
}

export const getChunkById = (
  id: string,
): ReplicadApiDocumentationChunk | null => {
  const stmt = db.prepare(`
    SELECT
      id,
      name,
      source,
      content,
      type,
      metadata
    FROM replicad_api_documentation_store
    WHERE id = $id
    LIMIT 1
  `)

  const row = stmt.get({ $id: id }) as
    | {
        id: string
        name: string
        source: string
        content: string
        type: string
        metadata: string | null
      }
    | undefined

  if (!row) {
    return null
  }

  return {
    id: row.id,
    name: row.name,
    source: row.source,
    content: row.content,
    type: row.type,
    metadata: row.metadata
      ? (JSON.parse(row.metadata) as Record<string, string>)
      : null,
  }
}

export const clearStore = () => {
  const stmt = db.prepare(`DELETE FROM replicad_api_documentation_store`)
  stmt.run()
}

export type ReplicadApiDocumentationChunk = {
  id: string
  name: string
  content: string
  source: string
  type: string
  metadata: Record<string, string> | null
}
