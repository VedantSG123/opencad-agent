import { Elysia } from 'elysia'
import { logixlysiaIns, logger } from './utils/logger'

const app = new Elysia().use(logixlysiaIns).get('/', () => 'Hello Elysia')

app.listen(3000)

logger.info('Server started on port 3000')
