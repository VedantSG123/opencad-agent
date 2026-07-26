import fs from 'fs'
import os from 'node:os'
import path from 'path'

import { CACHE_DIR, CONFIG_DIR, DATA_DIR, LOGS_DIR } from 'shared'

export { CACHE_DIR, CONFIG_DIR, DATA_DIR, LOGS_DIR }

export const DB_PATH = path.join(DATA_DIR, 'opencad.sqlite')

// Ensure all required directories exist
for (const dir of [DATA_DIR, CACHE_DIR, LOGS_DIR, CONFIG_DIR]) {
  fs.mkdirSync(dir, { recursive: true })
}

export const USER_HOME_DIR = os.homedir()
export const USER_DOCUMENTS_DIR = path.join(USER_HOME_DIR, 'Documents')
