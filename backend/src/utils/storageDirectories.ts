import envPaths from 'env-paths'
import fs from 'fs'
import path from 'path'

const paths = envPaths('opencad-agent', { suffix: '' })

export const DATA_DIR = paths.data
export const CACHE_DIR = paths.cache
export const LOGS_DIR = paths.log
export const CONFIG_DIR = paths.config

export const DB_PATH = path.join(DATA_DIR, 'opencad.sqlite')

// Ensure all required directories exist
for (const dir of [DATA_DIR, CACHE_DIR, LOGS_DIR, CONFIG_DIR]) {
  fs.mkdirSync(dir, { recursive: true })
}
