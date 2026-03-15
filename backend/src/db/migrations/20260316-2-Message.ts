import type { Migration } from '../migrate'

const up: Migration = async ({ context: db }) => {
  await Promise.resolve()
  db.transaction(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY NOT NULL,
          session_id TEXT NOT NULL,
          data TEXT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE ON UPDATE CASCADE
        );
      `)
    db.run(`
        CREATE TRIGGER update_message_timestamp
        AFTER UPDATE ON messages
        FOR EACH ROW
        BEGIN
            UPDATE messages
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = OLD.id;
        END;
      `)
    db.run(`
        CREATE INDEX idx_messages_session_id ON messages(session_id);
      `)
    db.run(`
        CREATE INDEX idx_messages_created_at ON messages(created_at);
      `)
  })()
}

const down: Migration = async ({ context: db }) => {
  await Promise.resolve()
  db.transaction(() => {
    db.run(`DROP INDEX IF EXISTS idx_messages_created_at`)
    db.run(`DROP INDEX IF EXISTS idx_messages_session_id`)
    db.run(`DROP TRIGGER IF EXISTS update_message_timestamp`)
    db.run(`DROP TABLE IF EXISTS messages`)
  })()
}

export { down, up }
