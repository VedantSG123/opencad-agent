import { Elysia, t } from 'elysia'

import { remove as removeAuth } from '../../models/auth'
import {
  getAuthenticatedStatus,
  getAvailableProviders,
} from '../../models/providers'
import { SUPPORTED_PROVIDERS } from '../../models/sdkConfig'
import { authRoutes } from './auth/index'

export const providersRoutes = new Elysia({ prefix: '/providers' })
  .use(authRoutes)

  .get('/', async () => {
    return await getAvailableProviders()
  })

  .get('/authenticated', async () => {
    return await getAuthenticatedStatus()
  })

  .delete(
    '/:providerId',
    async ({ params, status }) => {
      const { providerId } = params
      await removeAuth(providerId)
      return status(204)
    },
    {
      params: t.Object({
        providerId: t.Union(
          (SUPPORTED_PROVIDERS as readonly string[]).map((p) => t.Literal(p)),
        ),
      }),
    },
  )
