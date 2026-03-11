import type { Auth } from '../auth'
import type { Provider } from '../schemas'
import type { Authorization, CallbackResult, OAuthProvider } from './index'

const GITHUB_CLIENT_ID = 'Ov23lisygXuv7pJM7aVr'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const SCOPE = 'read:user'

const COPILOT_API_BASE_URL = `https://copilot-api.github.com`

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: SCOPE }),
  })

  if (!res.ok) {
    throw new Error(`GitHub device code request failed: ${res.status}`)
  }

  return res.json() as Promise<DeviceCodeResponse>
}

async function pollForToken(
  deviceCode: string,
  intervalSeconds: number,
): Promise<CallbackResult> {
  let currentInterval = intervalSeconds

  while (true) {
    await sleep((currentInterval + 3) * 1000)

    const res = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })

    if (!res.ok) {
      return { type: 'failed', error: `HTTP error from GitHub: ${res.status}` }
    }

    const data = (await res.json()) as Record<string, string>

    if (data.access_token) {
      return { type: 'success', accessToken: data.access_token }
    }

    switch (data.error) {
      case 'authorization_pending':
        break
      case 'slow_down':
        currentInterval += 5
        break
      case 'expired_token':
        return { type: 'failed', error: 'Device code expired' }
      case 'access_denied':
        return { type: 'failed', error: 'User denied access' }
      default:
        return {
          type: 'failed',
          error: data.error_description ?? data.error ?? 'Unknown error',
        }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const githubCopilotOAuthProvider: OAuthProvider = {
  id: 'github-copilot',
  title: 'GitHub Copilot',
  description:
    'Sign in with your GitHub account to use GitHub Copilot models. Uses the secure GitHub Device Authorization flow.',

  async authorize(): Promise<Authorization> {
    const deviceData = await requestDeviceCode()
    return {
      url: deviceData.verification_uri,
      instructions: `Open the URL and enter code: ${deviceData.user_code}`,
      method: 'auto',
      deviceCode: deviceData.device_code,
      intervalSeconds: deviceData.interval,
    }
  },

  callback(deviceCode: string, interval: number): Promise<CallbackResult> {
    return pollForToken(deviceCode, interval)
  },
}

export const loadCopilotProviderWithAuth = (auth: Auth, provider: Provider) => {
  if (auth.type !== 'oauth') {
    return provider
  }

  for (const model of Object.values(provider.models)) {
    const isClaude = model.id.includes('claude')
    model.api.url = COPILOT_API_BASE_URL
    if (isClaude) {
      model.api.url = `${COPILOT_API_BASE_URL}/v1`
    }

    model.api.npm = isClaude
      ? '@ai-sdk/anthropic'
      : '@opeoginni/github-copilot-openai-compatible'
  }

  provider.options = {
    apiKey: '',
    async fetch(request: RequestInfo, init?: RequestInit) {
      // Implement custom fetch for github copilot
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
      let isAgent = false
      let isVision = false

      const body: any =
        typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body

      if (body?.messages) {
        const lastMessage = body.messages[body.messages.length - 1]
        isVision = body.messages.some(
          (msg: any) =>
            Array.isArray(msg.content) &&
            msg.content.some((part: any) => part.type === 'image_url'),
        )
        isAgent = lastMessage?.role !== 'user'
      }

      // New Responses API used for codex models
      if (body?.input) {
        const lastMessage = body.input[body.input.length - 1]
        isVision = body.input.some(
          (msg: any) =>
            Array.isArray(msg.content) &&
            msg.content.some((part: any) => part.type === 'input_image'),
        )
        isAgent = lastMessage?.role !== 'user'
      }
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */

      const headers: Record<string, string> = {
        'x-initiator': isAgent ? 'agent' : 'user',
        ...(init?.headers as Record<string, string>),
        Authorization: `Bearer ${auth.refresh}`,
        'Openai-Intent': 'conversation-edits',
        ...(isVision ? { 'Copilot-Vision-Request': 'true' } : {}),
      }

      delete headers['x-api-key']
      delete headers['authorization']

      return fetch(request, {
        ...init,
        headers,
      })
    },
  }
  return provider
}
