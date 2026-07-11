import type { SupportedProviderIds } from '../sdkConfig'

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
  | {
      type: 'success'
      accessToken: string
      refreshToken?: string
      expires?: number
      accountId?: string
    }
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

export type OAuthFlowStatus = 'pending' | 'completed' | 'failed'

export interface OAuthFlowState {
  status: OAuthFlowStatus
  deviceCode: string
  intervalSeconds: number
  startedAt: string
}
