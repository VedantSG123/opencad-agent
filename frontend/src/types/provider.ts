export interface Model {
  id: string
  providerId: string
  name: string
  family?: string
  api: {
    id: string
    url: string
    npm: string
  }
  capabilities: {
    temperature: boolean
    reasoning: boolean
    attachment: boolean
    toolcall: boolean
    input: {
      text: boolean
      audio: boolean
      image: boolean
      video: boolean
      pdf: boolean
    }
    output: {
      text: boolean
      audio: boolean
      image: boolean
      video: boolean
      pdf: boolean
    }
    interlaved:
      | boolean
      | {
          field: 'reasoning_content' | 'reasoning_details'
        }
  }
  limit: {
    context: number
    input?: number
    output: number
  }
  status?: 'alpha' | 'beta' | 'deprecated' | 'active'
  release_date: string
}

export interface Provider {
  id: string
  name: string
  env?: string[]
  options: Record<string, unknown>
  models: Record<string, Model>
  oauth?: {
    description: string
  }
}

export type AuthenticatedStatus = Record<
  string,
  { authenticated: boolean; method?: 'api_key' | 'oauth' }
>

// Mirrors backend/src/models/oauth/types.ts
export interface OAuthAuthorization {
  url: string
  instructions: string
  method: 'auto' | 'manual'
  deviceCode: string
  intervalSeconds: number
}

// The backend responds 200 on success; failure comes back as a non-2xx
// (axios throws), so there is no "failed" success-path variant to model here.
export interface OAuthCallbackResult {
  status: 'success'
  message: string
}
