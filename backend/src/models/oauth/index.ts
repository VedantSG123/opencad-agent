import type { SupportedProviderIds } from '../sdkConfig'
import { githubCopilotOAuthProvider } from './github-copilot'

export const OAUTH_SUPPORTED_PROVIDERS = [
  'github-copilot',
] as const satisfies SupportedProviderIds[]

/** Union type of provider IDs that support OAuth */
export type OAuthSupportedProviderIds =
  (typeof OAUTH_SUPPORTED_PROVIDERS)[number]

// `method: "auto"` → UI should immediately call the callback endpoint and poll
// `method: "manual"` → UI waits for the user to action the callback themselves
export interface Authorization {
  url: string
  instructions: string
  method: 'auto' | 'manual'
  deviceCode: string
  intervalSeconds: number
}

export type CallbackResult =
  | { type: 'success'; accessToken: string }
  | { type: 'failed'; error: string }

export interface OAuthProviderInfo {
  id: SupportedProviderIds
  title: string
  description: string
}

export interface OAuthProvider extends OAuthProviderInfo {
  authorize(): Promise<Authorization>
  callback(deviceCode: string, intervalSeconds: number): Promise<CallbackResult>
}

export const oauthProviderRegistry: Record<
  OAuthSupportedProviderIds,
  OAuthProvider
> = {
  'github-copilot': githubCopilotOAuthProvider,
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

export type OAuthFlowStatus = 'pending' | 'completed' | 'failed'

export interface OAuthFlowState {
  status: OAuthFlowStatus
  deviceCode: string
  intervalSeconds: number
  startedAt: string
}

export const oauthPendingState = new Map<
  OAuthSupportedProviderIds,
  OAuthFlowState
>()
