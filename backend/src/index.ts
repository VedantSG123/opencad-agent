import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'

import { projectsRoutes } from './routes/projects/index'
import { providersRoutes } from './routes/providers/index'
import { engine } from './socketio'
import { isDevelopment } from './utils/isEnv'
import { logger, logixlysiaIns } from './utils/logger'

const app = new Elysia()
  .use(
    cors({
      origin: isDevelopment() ? ['http://localhost:5173'] : [],
    }),
  )
  .use(logixlysiaIns)
  .get('/', () => 'Hello Elysia')
  .all('/api/socket/*', ({ request, server, status }) => {
    if (!server) {
      return status(500, { message: 'Failed to initialize' })
    }
    return engine.handleRequest(request, server)
  })
  .group('/api', (app) => app.use(providersRoutes).use(projectsRoutes))

app.listen({
  port: 3000,
  ...engine.handler(),
})

logger.info('Server started on port 3000')
