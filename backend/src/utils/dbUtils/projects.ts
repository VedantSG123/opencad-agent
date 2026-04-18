import { db } from '../../db'
import type { Project } from '../../project/schema'

type ProjectRow = {
  id: string
  name: string
  cad_kernel: string
  directory: string
  file: string | null
  created_at: string
  updated_at: string
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    cad_kernel: row.cad_kernel as Project['cad_kernel'],
    directory: row.directory,
    file: row.file,
    time: {
      created: row.created_at,
      updated: row.updated_at,
    },
  }
}

export function upsertProject(project: Project): Project {
  db.query(
    `INSERT INTO projects (id, name, cad_kernel, directory, file)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       cad_kernel = excluded.cad_kernel,
       directory = excluded.directory,
       file = excluded.file`,
  ).run(
    project.id,
    project.name,
    project.cad_kernel,
    project.directory,
    project.file,
  )
  return getProjectById(project.id)!
}

export function getProjectById(id: string): Project | null {
  const row = db
    .query(
      `SELECT id, name, cad_kernel, directory, file, created_at, updated_at FROM projects WHERE id = ?`,
    )
    .get(id) as ProjectRow | null
  return row ? rowToProject(row) : null
}

export function getAllProjects(): Project[] {
  const rows = db
    .query(
      `SELECT id, name, cad_kernel, directory, file, created_at, updated_at FROM projects ORDER BY created_at ASC`,
    )
    .all() as ProjectRow[]
  return rows.map(rowToProject)
}

export function deleteProject(id: string): void {
  db.query(`DELETE FROM projects WHERE id = ?`).run(id)
}
