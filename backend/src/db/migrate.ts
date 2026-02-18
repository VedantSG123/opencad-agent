import { Umzug } from 'umzug'
import path from 'path'
import { db } from '.'
import { BunSqliteStorage } from './BunSqliteStorage'
import { logger } from '../utils/logger'

export const umzug = new Umzug({
  migrations: { glob: path.join(__dirname, 'migrations', '*.{ts,js}') },
  context: db,
  storage: new BunSqliteStorage({ database: db }),
  logger,
})

export type Migration = typeof umzug._types.migration
