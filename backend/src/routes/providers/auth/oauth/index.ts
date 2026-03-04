import { Elysia, t } from 'elysia'

import { set as setAuth } from '../../../../models/auth'
import type { OAuthSupportedProviderIds } from '../../../../models/oauth/index'
import {
  findOAuthProvider,
  listOAuthProviders,
  oauthPendingState,
} from '../../../../models/oauth/index'

const providerParam = t.Object({ providerId: t.String() })

export const oauthRoutes = new Elysia({ prefix: '/oauth' })
  .get('/', () => listOAuthProviders())

  .post(
    '/:providerId/authorize',
    async ({ params, status }) => {
      const { providerId } = params
      const provider = findOAuthProvider(providerId)
      if (!provider) {
        return status(400, {
          message: `Provider "${providerId}" does not support OAuth`,
        })
      }

      const existing = oauthPendingState.get(
        providerId as OAuthSupportedProviderIds,
      )
      if (existing?.status === 'pending') {
        return {
          status: 'pending',
          message: 'OAuth flow already in progress for this provider',
        }
      }

      let authorization
      try {
        authorization = await provider.authorize()
      } catch (e) {
        return status(502, {
          message: `Failed to initiate OAuth: ${(e as Error).message}`,
        })
      }

      oauthPendingState.set(providerId as OAuthSupportedProviderIds, {
        status: 'pending',
        deviceCode: authorization.deviceCode,
        intervalSeconds: authorization.intervalSeconds,
        startedAt: new Date().toISOString(),
      })

      return {
        url: authorization.url,
        instructions: authorization.instructions,
        method: authorization.method,
        deviceCode: authorization.deviceCode,
        intervalSeconds: authorization.intervalSeconds,
      }
    },
    { params: providerParam },
  )

  .post(
    '/:providerId/callback',
    async ({ params, status }) => {
      const { providerId } = params
      const provider = findOAuthProvider(providerId)
      if (!provider) {
        return status(400, {
          message: `Provider "${providerId}" does not support OAuth`,
        })
      }

      const state = oauthPendingState.get(
        providerId as OAuthSupportedProviderIds,
      )
      if (!state) {
        return status(409, {
          message: 'No pending OAuth flow found. Call /authorize first.',
        })
      }

      if (state.status !== 'pending') {
        return status(409, {
          message: `OAuth flow is already in status "${state.status}"`,
        })
      }

      const result = await provider.callback(
        state.deviceCode,
        state.intervalSeconds,
      )

      if (result.type === 'success') {
        await setAuth(providerId, {
          type: 'oauth',
          refresh: result.accessToken,
          access: result.accessToken,
          expires: 0,
        })

        oauthPendingState.set(providerId as OAuthSupportedProviderIds, {
          ...state,
          status: 'completed',
        })

        return { status: 'success', message: 'Authorization successful' }
      } else {
        oauthPendingState.set(providerId as OAuthSupportedProviderIds, {
          ...state,
          status: 'failed',
        })

        return status(502, { status: 'failed', message: result.error })
      }
    },
    { params: providerParam },
  )
