import { db } from '../../db'
import type { Session } from '../../session/schema'

type SessionRow = {
  id: string
  project_id: string
  title: string
  created_at: string
  updated_at: string
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    time: {
      created: row.created_at,
      updated: row.updated_at,
    },
  }
}

export function upsertSession(session: Session): Session {
  db.query(
    `INSERT INTO sessions (id, project_id, title)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       project_id = excluded.project_id`,
  ).run(session.id, session.project_id, session.title)
  return getSessionById(session.id)!
}

export function getSessionById(id: string): Session | null {
  const row = db
    .query(
      `SELECT id, project_id, title, created_at, updated_at FROM sessions WHERE id = ?`,
    )
    .get(id) as SessionRow | null
  return row ? rowToSession(row) : null
}

export function getSessionsByProjectId(projectId: string): Session[] {
  const rows = db
    .query(
      `SELECT id, project_id, title, created_at, updated_at FROM sessions WHERE project_id = ? ORDER BY created_at ASC`,
    )
    .all(projectId) as SessionRow[]
  return rows.map(rowToSession)
}

export function deleteSession(id: string): void {
  db.query(`DELETE FROM sessions WHERE id = ?`).run(id)
}
