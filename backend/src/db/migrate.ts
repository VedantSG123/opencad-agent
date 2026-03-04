import path from 'path'
import { Umzug } from 'umzug'

import { logger } from '../utils/logger'
import { db } from '.'
import { BunSqliteStorage } from './BunSqliteStorage'

export const umzug = new Umzug({
  migrations: { glob: path.join(__dirname, 'migrations', '*.{ts,js}') },
  context: db,
  storage: new BunSqliteStorage({ database: db }),
  logger,
})

export type Migration = typeof umzug._types.migration
