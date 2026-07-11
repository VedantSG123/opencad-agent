import type { Auth } from '../auth'
import type { Provider } from '../schemas'
import type { SupportedProviderIds } from '../sdkConfig'
import {
  githubCopilotOAuthProvider,
  loadCopilotProviderWithAuth,
} from './github-copilot'
import { loadOpenaiProviderWithAuth, openaiOAuthProvider } from './openai'
import type {
  OAuthFlowState,
  OAuthProvider,
  OAuthProviderInfo,
} from './types.js'
import { loadXaiProviderWithAuth, xaiOAuthProvider } from './xai'

export type {
  Authorization,
  CallbackResult,
  OAuthFlowState,
  OAuthFlowStatus,
  OAuthProvider,
  OAuthProviderInfo,
} from './types'

export const OAUTH_SUPPORTED_PROVIDERS = [
  'github-copilot',
  'openai',
  'xai',
] as const satisfies SupportedProviderIds[]

/** Union type of provider IDs that support OAuth */
export type OAuthSupportedProviderIds =
  (typeof OAUTH_SUPPORTED_PROVIDERS)[number]

export const oauthProviderRegistry: Record<
  OAuthSupportedProviderIds,
  OAuthProvider
> = {
  'github-copilot': githubCopilotOAuthProvider,
  openai: openaiOAuthProvider,
  xai: xaiOAuthProvider,
}

export function listOAuthProviders(): OAuthProviderInfo[] {
  return (
    OAUTH_SUPPORTED_PROVIDERS as readonly OAuthSupportedProviderIds[]
  ).map((id) => {
    const { title, description } = oauthProviderRegistry[id]
    return { id, title, description }
  })
}

export function findOAuthProvider(providerId: string): OAuthProvider | null {
  if (!(OAUTH_SUPPORTED_PROVIDERS as readonly string[]).includes(providerId)) {
    return null
  }
  return oauthProviderRegistry[providerId as OAuthSupportedProviderIds] ?? null
}

export const oauthPendingState = new Map<
  OAuthSupportedProviderIds,
  OAuthFlowState
>()

export function loadProviderWithOAuth(
  auth: Auth,
  provider: Provider,
): Provider {
  if (auth.type !== 'oauth') {
    return provider
  }

  switch (provider.id) {
    case 'github-copilot':
      return loadCopilotProviderWithAuth(auth, provider)
    case 'openai':
      return loadOpenaiProviderWithAuth(auth, provider)
    case 'xai':
      return loadXaiProviderWithAuth(auth, provider)
    default:
      return provider
  }
}
