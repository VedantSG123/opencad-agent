import type { LanguageModel } from 'ai'

import { getProviderCache } from '../models/providers'
import type { Model } from '../models/schemas'
import { providerSdkFunctionMap } from '../models/sdkConfig'

export type ModelRef = {
  providerId: string
  modelId: string
}

export type ResolvedModel = {
  ref: ModelRef
  /** What the model can do and how much context it has, from models.dev. */
  info: Model
  model: LanguageModel
}

/**
 * Every provider factory takes its own settings type and returns its own
 * provider type, and none of them share a base. What they do share is the
 * shape used here: options in, `(modelId) => LanguageModel` out.
 */
type ProviderFactory = (
  options: Record<string, unknown>,
) => (modelId: string) => LanguageModel

export async function resolveModel(ref: ModelRef): Promise<ResolvedModel> {
  const { providers } = await getProviderCache()

  const provider = providers[ref.providerId]
  if (!provider) {
    throw new Error(
      `No credentials for provider "${ref.providerId}". Connect it first, or pick one of: ${Object.keys(providers).join(', ') || '(none connected)'}.`,
    )
  }

  const info = provider.models[ref.modelId]
  if (!info) {
    throw new Error(
      `Provider "${ref.providerId}" has no model "${ref.modelId}".`,
    )
  }

  const factory = providerSdkFunctionMap[
    info.api.npm as keyof typeof providerSdkFunctionMap
  ] as ProviderFactory | undefined
  if (!factory) {
    throw new Error(
      `No AI SDK provider is wired up for "${info.api.npm}" (model ${ref.providerId}/${ref.modelId}).`,
    )
  }

  return {
    ref,
    info,
    model: factory(sdkOptions(provider.options, info))(info.api.id),
  }
}

/**
 * models.dev leaves `api` unset for providers whose SDK already points at the
 * right host, so a base URL is only passed when something - an OAuth loader,
 * a gateway like OpenRouter - actually named one.
 */
function sdkOptions(
  options: Record<string, unknown>,
  info: Model,
): Record<string, unknown> {
  // Env and stored-key detection spell it `apikey`; the OAuth loaders spell it
  // `apiKey`, which is what every SDK factory expects.
  const { apikey, ...rest } = options
  return {
    ...rest,
    ...(typeof apikey === 'string' ? { apiKey: apikey } : {}),
    ...(info.api.url ? { baseURL: info.api.url } : {}),
  }
}

export async function listConnectedModels(): Promise<ModelRef[]> {
  const { providers } = await getProviderCache()
  return Object.values(providers).flatMap((provider) =>
    Object.values(provider.models)
      .filter((model) => model.capabilities.toolcall)
      .map((model) => ({ providerId: provider.id, modelId: model.id })),
  )
}

export function formatModelRef(ref: ModelRef): string {
  return `${ref.providerId}/${ref.modelId}`
}

/** Splits `anthropic/claude-sonnet-4-5` into its two halves. */
export function parseModelRef(value: string): ModelRef {
  const separator = value.indexOf('/')
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(
      `"${value}" is not a model reference. Write it as <provider>/<model>.`,
    )
  }
  return {
    providerId: value.slice(0, separator),
    modelId: value.slice(separator + 1),
  }
}
