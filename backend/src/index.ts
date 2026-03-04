import { Elysia } from 'elysia'

import { providersRoutes } from './routes/providers/index'
import { logger, logixlysiaIns } from './utils/logger'

const app = new Elysia()
  .use(logixlysiaIns)
  .get('/', () => 'Hello Elysia')
  .use(providersRoutes)

app.listen(3000)

logger.info('Server started on port 3000')
