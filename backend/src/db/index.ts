import { Database } from 'bun:sqlite'

import { DB_PATH } from '../utils/directories'

export const db = new Database(DB_PATH)
db.run('PRAGMA foreign_keys = ON;')
