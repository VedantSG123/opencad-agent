import { Button, ScrollShadow, Skeleton } from '@heroui/react'
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

function ProviderRowSkeleton() {
  return (
    <div className='flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2'>
      <div className='flex items-center gap-2.5'>
        <Skeleton className='h-4 w-4 rounded-full' />
        <Skeleton className='h-4 w-28 rounded' />
      </div>
      <Skeleton className='h-8 w-24 rounded-lg' />
    </div>
  )
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
      <div className={cn('flex flex-col gap-6 h-full', className)}>
        <div className='flex flex-col gap-1'>
          <h3 className='text-base font-semibold text-foreground'>Providers</h3>
          <p className='text-sm text-muted-foreground'>
            Connect an AI provider to use its models.
          </p>
        </div>

        <div className='flex-1 min-h-0 flex flex-col gap-6 px-8 -mx-6'>
          <div className='flex flex-col gap-2'>
            <Skeleton className='h-4 w-20 rounded' />
            <div className='flex flex-col gap-1.5'>
              <ProviderRowSkeleton />
            </div>
          </div>

          <div className='flex flex-col gap-2'>
            <Skeleton className='h-4 w-20 rounded' />
            <Skeleton className='h-9 w-full rounded-lg' />
            <div className='flex flex-col gap-1.5'>
              <ProviderRowSkeleton />
              <ProviderRowSkeleton />
              <ProviderRowSkeleton />
            </div>
          </div>
        </div>
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
    <div className={cn('flex flex-col gap-6 h-full', className)}>
      <div className='flex flex-col gap-1'>
        <h3 className='text-base font-semibold text-foreground'>Providers</h3>
        <p className='text-sm text-muted-foreground'>
          Connect an AI provider to use its models.
        </p>
      </div>

      <ScrollShadow className='flex-1 min-h-0 overflow-y-auto px-8 -mx-6 flex flex-col gap-6'>
        <ConnectedProvidersSection providers={connectedProviders} />
        <AvailableProvidersSection
          providers={availableProviders}
          onConnect={setActiveProviderId}
        />
      </ScrollShadow>
    </div>
  )
}
