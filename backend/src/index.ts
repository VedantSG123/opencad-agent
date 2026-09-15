import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { MAX_ATTACHMENTS_TOTAL_BYTES } from 'shared'

import { umzug } from './db/migrate'
import { projectsRoutes } from './routes/projects/index'
import { providersRoutes } from './routes/providers/index'
import { sessionsRoutes } from './routes/sessions/index'
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
    app.use(providersRoutes).use(projectsRoutes).use(sessionsRoutes),
  )

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000

// Attachments travel as base64 inside the prompt body, which inflates them by
// a third. The route checks the decoded size and answers with a reason; this
// is the backstop that stops a body far past the limit being parsed at all.
const MAX_REQUEST_BODY_BYTES =
  Math.ceil(MAX_ATTACHMENTS_TOTAL_BYTES * (4 / 3)) + 1024 * 1024

app.listen({
  port,
  hostname: '127.0.0.1',
  maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
})

logger.info(`Server started on http://127.0.0.1:${port}`)
