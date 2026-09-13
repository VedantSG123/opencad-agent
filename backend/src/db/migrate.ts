import path from 'path'

import { Umzug } from 'umzug'

import { db } from '.'
import { logger } from '../utils/logger'
import { isCompiled } from '../utils/runtime'
import { BunSqliteStorage } from './BunSqliteStorage'

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
