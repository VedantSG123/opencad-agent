import { Button } from '@heroui/react'
import { Alert02Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { useMemo, useState } from 'react'

import { Icon } from '@/components/icons/HugeIcon'
import { useAuthenticatedProviders, useProviders } from '@/hooks/useProviders'
import { cn } from '@/lib/utils'

import { AvailableProvidersSection } from './AvailableProvidersSection'
import { ConnectedProvidersSection } from './ConnectedProvidersSection'
import { ConnectProviderView } from './ConnectProviderView'

interface ProvidersPanelProps {
  className?: string
}

export function ProvidersPanel({ className }: ProvidersPanelProps) {
  const {
    data: providers,
    isLoading: isLoadingProviders,
    isError: isProvidersError,
    refetch: refetchProviders,
  } = useProviders()
  const {
    data: authStatus,
    isLoading: isLoadingAuth,
    isError: isAuthError,
    refetch: refetchAuth,
  } = useAuthenticatedProviders()

  const [activeProviderId, setActiveProviderId] = useState<string | null>(null)

  const connectedIds = useMemo(
    () =>
      new Set(
        Object.entries(authStatus ?? {})
          .filter(([, status]) => status.authenticated)
          .map(([id]) => id),
      ),
    [authStatus],
  )

  const connectedProviders = useMemo(
    () => Object.values(providers ?? {}).filter((p) => connectedIds.has(p.id)),
    [providers, connectedIds],
  )

  const availableProviders = useMemo(
    () => Object.values(providers ?? {}).filter((p) => !connectedIds.has(p.id)),
    [providers, connectedIds],
  )

  const isLoading = isLoadingProviders || isLoadingAuth
  const isError = isProvidersError || isAuthError

  const activeProvider = activeProviderId
    ? (providers?.[activeProviderId] ?? null)
    : null

  if (isError) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-3 py-10 text-center',
          className,
        )}
      >
        <Icon icon={Alert02Icon} size={32} className='text-danger' />
        <div>
          <p className='font-semibold'>Failed to load providers</p>
          <p className='text-sm text-muted-foreground mt-1'>
            Check that the backend server is running.
          </p>
        </div>
        <Button
          variant='outline'
          size='sm'
          onPress={() => {
            void refetchProviders()
            void refetchAuth()
          }}
        >
          <Icon icon={Refresh01Icon} size={16} />
          Retry
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={cn('flex flex-col gap-6', className)}>
        <p className='text-sm text-muted-foreground'>Loading providers…</p>
      </div>
    )
  }

  if (activeProvider) {
    return (
      <ConnectProviderView
        provider={activeProvider}
        className={className}
        onBack={() => setActiveProviderId(null)}
      />
    )
  }

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className='flex flex-col gap-1'>
        <h3 className='text-base font-semibold text-foreground'>Providers</h3>
        <p className='text-sm text-muted-foreground'>
          Connect an AI provider to use its models.
        </p>
      </div>

      <ConnectedProvidersSection providers={connectedProviders} />

      <AvailableProvidersSection
        providers={availableProviders}
        onConnect={setActiveProviderId}
      />
    </div>
  )
}
