import os from 'os'
import path from 'path'
import fs from 'fs'
import logixlysia from 'logixlysia'

const baseDir = path.join(os.homedir(), '.opencad-agent')
const logsDir = path.join(baseDir, 'logs')

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

export const logixlysiaIns = logixlysia({
  config: {
    logFilePath: path.join(logsDir, 'app.log'),
    pino: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      base: {
        service: 'opencad-agent',
        version: '1.0.0',
      },
    },
  },
})

export const logger = logixlysiaIns.store.pino
