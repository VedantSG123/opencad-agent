import type {
  Model as ModelsDevModel,
  Provider as ModelsDevProvider,
  ProviderMap,
} from '@opencode-ai/models'
import { Models } from '@opencode-ai/models'

export type { ModelsDevModel, ModelsDevProvider, ProviderMap }

const client = Models.make()

export async function getModelsDev(): Promise<ProviderMap> {
  try {
    return await client.providers()
  } catch {
    const { providers } = await import('@opencode-ai/models/snapshot')
    return providers
  }
}

export type ModelsDevResponse = ProviderMap
