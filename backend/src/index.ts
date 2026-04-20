import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'

import { projectsRoutes } from './routes/projects/index'
import { providersRoutes } from './routes/providers/index'
import { wsRoutes } from './routes/ws/index'
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
  .group('/api', (app) =>
    app.use(providersRoutes).use(projectsRoutes).use(wsRoutes),
  )

app.listen({
  port: 3000,
})

logger.info('Server started on port 3000')
