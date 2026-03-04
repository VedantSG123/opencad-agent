import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createGitHubCopilotOpenAICompatible } from '@opeoginni/github-copilot-openai-compatible'
import z from 'zod'

export const SUPPORTED_PROVIDERS = [
  'google',
  'openai',
  'anthropic',
  'github-copilot',
] as const

const SupportedProviderIdsSchema = z.enum(SUPPORTED_PROVIDERS)
export type SupportedProviderIds = z.infer<typeof SupportedProviderIdsSchema>

export const sdkConfigSchema = z.object({
  providerId: SupportedProviderIdsSchema,
  envMapping: z.record(z.string(), z.string()).optional(),
})

type SDKConfigValue = z.infer<typeof sdkConfigSchema>

export const SDKConfig: Record<SupportedProviderIds, SDKConfigValue> = {
  google: {
    providerId: 'google',
  },
  openai: {
    providerId: 'openai',
  },
  anthropic: {
    providerId: 'anthropic',
  },
  'github-copilot': {
    providerId: 'github-copilot',
  },
}

export const providerSdkFunctionMap = {
  '@ai-sdk/google': createGoogleGenerativeAI,
  '@ai-sdk/openai': createOpenAI,
  '@ai-sdk/anthropic': createAnthropic,
  '@opeoginni/github-copilot-openai-compatible':
    createGitHubCopilotOpenAICompatible,
}
