import path from 'path'
import logixlysia from 'logixlysia'

import { LOGS_DIR } from './storageDirectories'

export const logixlysiaIns = logixlysia({
  config: {
    logFilePath: path.join(LOGS_DIR, 'app.log'),
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
