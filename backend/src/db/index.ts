import { Database } from 'bun:sqlite'

import { DB_PATH } from '../utils/storageDirectories'

export const db = new Database(DB_PATH)
db.run('PRAGMA foreign_keys = ON;')
