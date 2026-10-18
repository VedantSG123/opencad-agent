import { db } from '../../db'
import type { Message } from '../../session/messageSchema'
import { MessageSchema } from '../../session/messageSchema'

type MessageRow = {
  id: string
  session_id: string
  data: string
}

/**
 * `id` and `session_id` live in their own columns so they can be indexed and
 * joined; the rest of the message travels as JSON, which is what lets a new
 * part or message field ship without a migration.
 */
function rowToMessage(row: MessageRow): Message {
  const parsed = MessageSchema.safeParse({
    ...(JSON.parse(row.data) as object),
    id: row.id,
    session_id: row.session_id,
  })
  if (!parsed.success) {
    throw new Error(
      `Message ${row.id} does not match the message schema: ${parsed.error.message}`,
    )
  }
  return parsed.data
}

export function upsertMessage(message: Message): Message {
  const { id, session_id, ...data } = message
  db.query(
    `INSERT INTO messages (id, session_id, data)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       data = excluded.data`,
  ).run(id, session_id, JSON.stringify(data))
  return message
}

export function getMessageById(id: string): Message | null {
  const row = db
    .query(`SELECT id, session_id, data FROM messages WHERE id = ?`)
    .get(id) as MessageRow | null
  return row ? rowToMessage(row) : null
}

/**
 * Ordered by id rather than `created_at`: ids carry a millisecond timestamp
 * plus a counter, so two messages written in the same millisecond still come
 * back in the order they were made.
 */
export function getMessagesBySessionId(sessionId: string): Message[] {
  const rows = db
    .query(
      `SELECT id, session_id, data FROM messages WHERE session_id = ? ORDER BY id ASC`,
    )
    .all(sessionId) as MessageRow[]
  return rows.map(rowToMessage)
}

export function deleteMessage(id: string): void {
  db.query(`DELETE FROM messages WHERE id = ?`).run(id)
}
