import type { Migration } from '../migrate'

const up: Migration = async ({ context: db }) => {
  await Promise.resolve()
  db.transaction(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS message_parts (
          id TEXT PRIMARY KEY NOT NULL,
          message_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          data TEXT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE ON UPDATE CASCADE
        );
      `)
    db.run(`
        CREATE TRIGGER update_message_part_timestamp
        AFTER UPDATE ON message_parts
        FOR EACH ROW
        BEGIN
            UPDATE message_parts
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = OLD.id;
        END;
      `)
    db.run(`
        CREATE INDEX idx_message_parts_message_id ON message_parts(message_id);
      `)
    db.run(`
        CREATE INDEX idx_message_parts_session_id ON message_parts(session_id);
      `)
  })()
}

const down: Migration = async ({ context: db }) => {
  await Promise.resolve()
  db.transaction(() => {
    db.run(`DROP INDEX IF EXISTS idx_message_parts_session_id`)
    db.run(`DROP INDEX IF EXISTS idx_message_parts_message_id`)
    db.run(`DROP TRIGGER IF EXISTS update_message_part_timestamp`)
    db.run(`DROP TABLE IF EXISTS message_parts`)
  })()
}

export { down, up }
