import type { Migration } from '../migrate'

const up: Migration = async ({ context: db }) => {
  await Promise.resolve()
  db.transaction(() => {
    db.run(`
    ALTER TABLE projects ADD COLUMN last_accessed_at DATETIME;
  `)
  })()
}

const down: Migration = async ({ context: db }) => {
  await Promise.resolve()
  db.transaction(() => {
    db.run(`
    ALTER TABLE projects DROP COLUMN last_accessed_at;
  `)
  })()
}

export { down, up }
