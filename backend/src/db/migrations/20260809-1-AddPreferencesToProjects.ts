import type { Migration } from '../migrate'

const up: Migration = async ({ context: db }) => {
  await Promise.resolve()
  db.transaction(() => {
    db.run(`
    ALTER TABLE projects ADD COLUMN preferences TEXT NOT NULL DEFAULT '{}';
  `)
  })()
}

const down: Migration = async ({ context: db }) => {
  await Promise.resolve()
  db.transaction(() => {
    db.run(`
    ALTER TABLE projects DROP COLUMN preferences;
  `)
  })()
}

export { down, up }
