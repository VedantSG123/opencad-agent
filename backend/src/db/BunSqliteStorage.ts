import { Database } from 'bun:sqlite'
import { type UmzugStorage, type MigrationParams } from 'umzug'

export class BunSqliteStorage implements UmzugStorage<Database> {
  private database: Database

  constructor({ database }: { database: Database }) {
    this.database = database
    this.ensureTable()
  }

  /**
   * Create migration table if not exists
   */
  private ensureTable() {
    this.database.run(`
      CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
        name TEXT PRIMARY KEY
      );
    `)
  }

  /**
   * Mark migration as executed
   */
  async logMigration({ name }: MigrationParams<Database>): Promise<void> {
    const stmt = this.database.prepare(`
      INSERT INTO "SequelizeMeta" (name)
      VALUES ($migrationName)
      ON CONFLICT(name) DO NOTHING
    `)

    stmt.run({ migrationName: name })
  }

  /**
   * Mark migration as pending (rollback)
   */
  async unlogMigration({ name }: MigrationParams<Database>): Promise<void> {
    const stmt = this.database.prepare(`
      DELETE FROM "SequelizeMeta"
      WHERE name = $migrationName
    `)

    stmt.run({ migrationName: name })
  }

  /**
   * List executed migrations
   */
  async executed(
    _meta: Pick<MigrationParams<Database>, 'context'>,
  ): Promise<string[]> {
    const stmt = this.database.prepare(`
      SELECT name FROM "SequelizeMeta"
      ORDER BY name ASC
    `)

    const rows = stmt.all() as { name: string }[]

    return rows.map((r) => r.name)
  }
}
