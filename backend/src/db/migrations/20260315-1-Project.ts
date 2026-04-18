import type { Migration } from '../migrate'

const up: Migration = async ({ context: db }) => {
  await Promise.resolve()
  db.transaction(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          cad_kernel TEXT NOT NULL,
          directory TEXT NOT NULL,
          file TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `)
    db.run(`
        CREATE TRIGGER update_project_timestamp
        AFTER UPDATE ON projects
        FOR EACH ROW
        BEGIN
            UPDATE projects
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = OLD.id;
        END;
      `)
  })()
}

const down: Migration = async ({ context: db }) => {
  await Promise.resolve()
  db.transaction(() => {
    db.run(`DROP TRIGGER IF EXISTS update_project_timestamp`)
    db.run(`DROP TABLE IF EXISTS projects`)
  })()
}

export { down, up }
