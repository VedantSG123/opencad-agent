import type { Migration } from '../migrate'

const up: Migration = async ({ context: db }) => {
  db.run(`
      CREATE TABLE IF NOT EXISTS replicad_api_documentation_store (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
}

const down: Migration = async ({ context: db }) => {
  db.run(`DROP TABLE IF EXISTS replicad_api_documentation_store`)
}

export { down, up }
