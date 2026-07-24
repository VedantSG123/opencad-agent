import { Button } from '@heroui/react'
import { Alert02Icon } from '@hugeicons/core-free-icons'
import { useState } from 'react'
import { toast } from 'sonner'

import { Icon } from '@/components/icons/HugeIcon'
import { extractErrorMessage } from '@/hooks/useProjects'
import {
  useAuthorizeOAuth,
  useCompleteOAuth,
  useInvalidateProviders,
} from '@/hooks/useProviders'
import type { OAuthAuthorization, Provider } from '@/types/provider'

interface OAuthConnectFlowProps {
  provider: Provider
  onDone: () => void
}

type FlowState = 'idle' | 'authorizing' | 'waiting' | 'error'

function openExternalUrl(url: string) {
  if (window.electron) {
    void window.electron.openExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function OAuthConnectFlow({ provider, onDone }: OAuthConnectFlowProps) {
  const [state, setState] = useState<FlowState>('idle')
  const [authorization, setAuthorization] = useState<OAuthAuthorization | null>(
    null,
  )
  const [errorMessage, setErrorMessage] = useState('')

  const { mutateAsync: authorize } = useAuthorizeOAuth()
  const { mutateAsync: completeOAuth } = useCompleteOAuth()
  const { invalidateProviders } = useInvalidateProviders()

  async function runCompletion() {
    setState('waiting')
    try {
      await completeOAuth(provider.id)
      await invalidateProviders()
      toast.success(`${provider.name} connected`)
      onDone()
    } catch (error) {
      setErrorMessage(extractErrorMessage(error, 'Authorization failed'))
      setState('error')
    }
  }

  async function handleSignIn() {
    setState('authorizing')
    try {
      const auth = await authorize(provider.id)
      setAuthorization(auth)
      openExternalUrl(auth.url)
      if (auth.method === 'auto') {
        await runCompletion()
      } else {
        setState('waiting')
      }
    } catch (error) {
      setErrorMessage(extractErrorMessage(error, 'Failed to start sign-in'))
      setState('error')
    }
  }

  return (
    <div className='flex flex-col gap-4'>
      <p className='text-sm text-muted-foreground'>
        {provider.oauth?.description}
      </p>

      {state === 'idle' && (
        <Button
          className='bg-primary text-white self-start'
          onPress={() => void handleSignIn()}
        >
          Sign In
        </Button>
      )}

      {state === 'authorizing' && (
        <p className='text-sm text-muted-foreground'>Opening browser…</p>
      )}

      {state === 'waiting' && (
        <div className='flex flex-col gap-3'>
          {authorization && (
            <p className='text-sm text-muted-foreground'>
              {authorization.instructions}
            </p>
          )}
          <p className='text-sm text-muted-foreground'>
            Waiting for you to complete sign-in…
          </p>
          {authorization?.method === 'manual' && (
            <Button
              variant='outline'
              size='sm'
              className='self-start'
              onPress={() => void runCompletion()}
            >
              I&apos;ve completed sign-in
            </Button>
          )}
        </div>
      )}

      {state === 'error' && (
        <div className='flex flex-col gap-3'>
          <div className='flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger'>
            <Icon icon={Alert02Icon} size={16} className='shrink-0 mt-0.5' />
            <p>{errorMessage}</p>
          </div>
          <Button
            variant='outline'
            size='sm'
            className='self-start'
            onPress={() => void handleSignIn()}
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  )
}
