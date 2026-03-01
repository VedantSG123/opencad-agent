import { getModelsDev } from './modelsDev'
import type {
  Provider as ModelsDevProvider,
  Model as ModelsDevModel,
} from './modelsDev'
import type { Model, Provider } from './schemas'
import { SUPPORTED_PROVIDERS, SDKConfig } from './sdkConfig'
import { all as getAllAuth } from './auth'

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
      temperature: model.temperature,
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
  return {
    id: provider.id,
    name: provider.name,
    env: provider.env || [],
    options: {},
    models: Object.fromEntries(
      Object.entries(provider.models).map(([modelId, model]) => [
        modelId,
        transformModelsDevModel(provider, model),
      ]),
    ),
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
