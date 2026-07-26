import { all as getAllAuth, refresh as refreshAuth } from './auth'
import type { ModelsDevModel, ModelsDevProvider } from './modelsDev'
import { getModelsDev } from './modelsDev'
import {
  loadProviderWithOAuth,
  OAUTH_SUPPORTED_PROVIDERS,
  oauthProviderRegistry,
  type OAuthSupportedProviderIds,
} from './oauth'
import type { Model, Provider } from './schemas'
import { SDKConfig, SUPPORTED_PROVIDERS } from './sdkConfig'

const GOOGLE_ENV = ['GEMINI_API_KEY']

function transformModelsDevModel(
  provider: ModelsDevProvider,
  model: ModelsDevModel,
): Model {
  return {
    id: model.id,
    providerId: provider.id,
    name: model.name,
    family: model.family,
    api: {
      id: model.id,
      url: provider.api!,
      npm: provider.npm || '',
    },
    status: model.status || 'active',
    limit: {
      context: model.limit.context,
      input: model.limit.input,
      output: model.limit.output,
    },
    capabilities: {
      temperature: model.temperature !== undefined ? model.temperature : false,
      reasoning: model.reasoning,
      attachment: model.attachment,
      toolcall: model.tool_call,
      input: {
        text: model.modalities?.input.includes('text') || false,
        audio: model.modalities?.input.includes('audio') || false,
        image: model.modalities?.input.includes('image') || false,
        video: model.modalities?.input.includes('video') || false,
        pdf: model.modalities?.input.includes('pdf') || false,
      },
      output: {
        text: model.modalities?.output.includes('text') || false,
        audio: model.modalities?.output.includes('audio') || false,
        image: model.modalities?.output.includes('image') || false,
        video: model.modalities?.output.includes('video') || false,
        pdf: model.modalities?.output.includes('pdf') || false,
      },
      interlaved: model.interleaved || false,
    },
    release_date: model.release_date,
  }
}

function transformModelsDevProvider(provider: ModelsDevProvider): Provider {
  const models = Object.fromEntries(
    Object.entries(provider.models)
      .map(
        ([modelId, model]) =>
          [modelId, transformModelsDevModel(provider, model)] as const,
      )
      .filter(
        ([, model]) =>
          model.capabilities.input.text && model.capabilities.output.text,
      ),
  )

  const oauth = (OAUTH_SUPPORTED_PROVIDERS as readonly string[]).includes(
    provider.id,
  )
    ? {
        description:
          oauthProviderRegistry[provider.id as OAuthSupportedProviderIds]
            .description,
      }
    : undefined

  return {
    id: provider.id,
    name: provider.name,
    env: provider.id === 'google' ? GOOGLE_ENV : provider.env || [],
    options: {},
    models,
    ...(oauth && { oauth }),
  }
}

function getEnv() {
  return process.env as Record<string, string | undefined>
}

type ProviderCache = {
  providers: Record<string, Provider>
}

let providerCache: ProviderCache | null = null

async function initProviderCache(): Promise<ProviderCache> {
  const detectedProviders: Record<string, Provider> = {}
  const modelsDev = await getModelsDev()
  const allProviders = Object.fromEntries(
    Object.entries(modelsDev)
      .filter(([providerId]) =>
        (SUPPORTED_PROVIDERS as readonly string[]).includes(providerId),
      )
      .map(([providerId, provider]) => [
        providerId,
        transformModelsDevProvider(provider),
      ]),
  )

  // First pass: detect which providers have their env vars set
  const env = getEnv()
  for (const [providerId, provider] of Object.entries(allProviders)) {
    if (provider.env && provider.env.length > 0) {
      if (provider.env.length === 1) {
        const apikey = env[provider.env[0]]
        if (apikey) {
          detectedProviders[providerId] = {
            ...provider,
            options: {
              apikey: apikey,
            },
          }
        }
      } else {
        const envMapping =
          SDKConfig[providerId as keyof typeof SDKConfig].envMapping
        if (envMapping) {
          const allEnvPresent = provider.env.every((envVar) => env[envVar])
          if (allEnvPresent) {
            const options = Object.fromEntries(
              Object.entries(envMapping).map(([optionKey, envVar]) => [
                optionKey,
                env[envVar]!,
              ]),
            )
            detectedProviders[providerId] = {
              ...provider,
              options,
            }
          }
        }
      }
    }
  }

  // Second pass: Read auth config for api key providers
  const allAuth = await getAllAuth()
  for (const [authProviderId, auth] of Object.entries(allAuth)) {
    if (auth.type !== 'api_key') continue
    const keys = auth.keys
    const keyCount = Object.keys(keys).length
    if (keyCount === 0) continue
    if (keyCount === 1) {
      detectedProviders[authProviderId] = {
        ...allProviders[authProviderId],
        options: {
          apikey: Object.values(keys)[0],
        },
      }
      continue
    }

    const envMapping =
      SDKConfig[authProviderId as keyof typeof SDKConfig].envMapping
    if (!envMapping) continue
    const options = Object.fromEntries(
      Object.entries(envMapping).map(([optionKey, envVar]) => [
        optionKey,
        keys[envVar],
      ]),
    )
    detectedProviders[authProviderId] = {
      ...allProviders[authProviderId],
      options,
    }
  }

  // Third pass: For all oauth providers
  for (const [authProviderId, auth] of Object.entries(allAuth)) {
    if (auth.type !== 'oauth') continue
    detectedProviders[authProviderId] = loadProviderWithOAuth(
      auth,
      allProviders[authProviderId],
    )
  }

  return {
    providers: detectedProviders,
  }
}

export async function getProviderCache(): Promise<ProviderCache> {
  if (!providerCache) {
    providerCache = await initProviderCache()
  }
  return providerCache
}

export function invalidateProviderCache() {
  providerCache = null
}

export async function getAvailableProviders(): Promise<
  Record<string, Provider>
> {
  const modelsDev = await getModelsDev()
  return Object.fromEntries(
    Object.entries(modelsDev)
      .filter(([providerId]) =>
        (SUPPORTED_PROVIDERS as readonly string[]).includes(providerId),
      )
      .map(([providerId, provider]) => [
        providerId,
        transformModelsDevProvider(provider),
      ]),
  )
}

export async function getAuthenticatedStatus(): Promise<
  Record<string, { authenticated: boolean; method?: 'api_key' | 'oauth' }>
> {
  // Credentials written directly via the Electron IPC vault bypass this
  // module's set()/remove(), so the lazy auth cache can go stale. Force a
  // fresh read here (and recompute the provider cache from it) so a
  // just-connected key shows up immediately without an app restart.
  const allAuth = await refreshAuth()
  invalidateProviderCache()
  const cache = await getProviderCache()

  const status: Record<
    string,
    { authenticated: boolean; method?: 'api_key' | 'oauth' }
  > = {}

  for (const providerId of SUPPORTED_PROVIDERS) {
    const auth = allAuth[providerId]
    if (auth) {
      status[providerId] = {
        authenticated: true,
        method: auth.type,
      }
    } else if (cache.providers[providerId]) {
      status[providerId] = {
        authenticated: true,
        method: 'api_key',
      }
    } else {
      status[providerId] = {
        authenticated: false,
      }
    }
  }

  return status
}
