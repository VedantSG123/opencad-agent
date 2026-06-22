import path from 'path'
import { Umzug } from 'umzug'

import { logger } from '../utils/logger'
import { db } from '.'
import { BunSqliteStorage } from './BunSqliteStorage'

// When Bun compiles the entrypoint to a binary, process.execPath is the path to the binary.
// In development, process.execPath is the path to the bun executable.
// We check if the running process is the compiled binary by checking if process.execPath
// ends with 'backend-api' or similar.
const isCompiled =
  process.execPath.endsWith('backend-api') ||
  process.execPath.endsWith('backend-api.exe')

const migrationsDir =
  process.env.MIGRATIONS_PATH ||
  (isCompiled
    ? path.join(path.dirname(process.execPath), 'migrations')
    : path.join(__dirname, 'migrations'))

const globPattern = path.join(migrationsDir, '*.{ts,js}').replace(/\\/g, '/')

logger.info(`Loading migrations from: ${migrationsDir}`)

export const umzug = new Umzug({
  migrations: { glob: globPattern },
  context: db,
  storage: new BunSqliteStorage({ database: db }),
  logger,
})

export type Migration = typeof umzug._types.migration
