import type { Authorization, CallbackResult, OAuthProvider } from './index'

const GITHUB_CLIENT_ID = 'Ov23lisygXuv7pJM7aVr'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const SCOPE = 'read:user'

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
