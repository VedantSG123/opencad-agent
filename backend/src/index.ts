import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'

import { umzug } from './db/migrate'
import { projectsRoutes } from './routes/projects/index'
import { providersRoutes } from './routes/providers/index'
import { wsRoutes } from './routes/ws/index'
import { isDevelopment } from './utils/isEnv'
import { logger, logixlysiaIns } from './utils/logger'

// Run migrations on startup
logger.info('Running database migrations...')
try {
  await umzug.up()
  logger.info('Database migrations completed successfully.')
} catch (err) {
  logger.error({ err }, 'Failed to run database migrations')
  process.exit(1)
}

const app = new Elysia()
  .use(
    cors({
      origin: isDevelopment() ? ['http://localhost:5173'] : true,
    }),
  )
  .use(logixlysiaIns)
  .get('/', () => 'Hello Elysia')
  .group('/api', (app) =>
    app.use(providersRoutes).use(projectsRoutes).use(wsRoutes),
  )

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000

app.listen({
  port,
  hostname: '127.0.0.1',
})

logger.info(`Server started on http://127.0.0.1:${port}`)
