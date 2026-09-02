import { db } from '../../db'
import type { Part } from '../../session/messageSchema'
import { PartSchema } from '../../session/messageSchema'

type PartRow = {
  id: string
  message_id: string
  session_id: string
  data: string
}

function rowToPart(row: PartRow): Part {
  const parsed = PartSchema.safeParse({
    ...(JSON.parse(row.data) as object),
    id: row.id,
    message_id: row.message_id,
    session_id: row.session_id,
  })
  if (!parsed.success) {
    throw new Error(
      `Part ${row.id} does not match the part schema: ${parsed.error.message}`,
    )
  }
  return parsed.data
}

export function upsertPart(part: Part): Part {
  const { id, message_id, session_id, ...data } = part
  db.query(
    `INSERT INTO message_parts (id, message_id, session_id, data)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       data = excluded.data`,
  ).run(id, message_id, session_id, JSON.stringify(data))
  return part
}

/** Ordered by id, for the same reason `getMessagesBySessionId` is. */
export function getPartsByMessageId(messageId: string): Part[] {
  const rows = db
    .query(
      `SELECT id, message_id, session_id, data FROM message_parts WHERE message_id = ? ORDER BY id ASC`,
    )
    .all(messageId) as PartRow[]
  return rows.map(rowToPart)
}

export function getPartsBySessionId(sessionId: string): Part[] {
  const rows = db
    .query(
      `SELECT id, message_id, session_id, data FROM message_parts WHERE session_id = ? ORDER BY id ASC`,
    )
    .all(sessionId) as PartRow[]
  return rows.map(rowToPart)
}

export function deletePart(id: string): void {
  db.query(`DELETE FROM message_parts WHERE id = ?`).run(id)
}
