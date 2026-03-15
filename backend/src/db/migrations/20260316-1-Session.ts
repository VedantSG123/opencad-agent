import type { Migration } from '../migrate'

const up: Migration = async ({ context: db }) => {
  await Promise.resolve()
  db.transaction(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY NOT NULL,
          project_id TEXT NOT NULL,
          title TEXT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE
        );
      `)
    db.run(`
        CREATE TRIGGER update_session_timestamp
        AFTER UPDATE ON sessions
        FOR EACH ROW
        BEGIN
            UPDATE sessions
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = OLD.id;
        END;
      `)
    db.run(`
        CREATE INDEX idx_sessions_project_id ON sessions(project_id);
      `)
  })()
}

const down: Migration = async ({ context: db }) => {
  await Promise.resolve()
  db.transaction(() => {
    db.run(`DROP INDEX IF EXISTS idx_sessions_project_id`)
    db.run(`DROP TRIGGER IF EXISTS update_session_timestamp`)
    db.run(`DROP TABLE IF EXISTS sessions`)
  })()
}

export { down, up }
