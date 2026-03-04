import { Elysia } from 'elysia'

import { oauthRoutes } from './oauth/index'

export const authRoutes = new Elysia({ prefix: '/auth' }).use(oauthRoutes)
