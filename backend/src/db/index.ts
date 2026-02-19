import os from 'os'
import path from 'path'
import fs from 'fs'
import { Database } from 'bun:sqlite'

const baseDir = path.join(os.homedir(), '.opencad-agent')
const dbPath = path.join(baseDir, 'opencad.sqlite')

if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir, { recursive: true })
}

export const db = new Database(dbPath)
