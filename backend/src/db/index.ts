import { Database } from 'bun:sqlite'

import { DB_PATH } from '../utils/storageDirectories'

export const db = new Database(DB_PATH)
