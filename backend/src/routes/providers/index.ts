import { Elysia } from 'elysia'

import { authRoutes } from './auth/index'

export const providersRoutes = new Elysia({ prefix: '/providers' }).use(
  authRoutes,
)
