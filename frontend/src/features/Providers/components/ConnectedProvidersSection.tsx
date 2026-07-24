import { Button, Label } from '@heroui/react'
import { Key01Icon, Logout03Icon } from '@hugeicons/core-free-icons'
import { useState } from 'react'
import { toast } from 'sonner'

import { Icon } from '@/components/icons/HugeIcon'
import { extractErrorMessage } from '@/hooks/useProjects'
import {
  useDisconnectProvider,
  useInvalidateProviders,
} from '@/hooks/useProviders'
import type { Provider } from '@/types/provider'

interface ConnectedProvidersSectionProps {
  providers: Provider[]
}

export function ConnectedProvidersSection({
  providers,
}: ConnectedProvidersSectionProps) {
  const { mutateAsync: disconnectProvider } = useDisconnectProvider()
  const { invalidateProviders } = useInvalidateProviders()
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)

  async function handleDisconnect(providerId: string) {
    setDisconnectingId(providerId)
    try {
      await disconnectProvider(providerId)
      await invalidateProviders()
      toast.success('Provider disconnected')
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Failed to disconnect provider'))
    } finally {
      setDisconnectingId(null)
    }
  }

  if (providers.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        You haven&apos;t connected any providers yet.
      </p>
    )
  }

  return (
    <div className='flex flex-col gap-2'>
      <Label className='text-sm font-medium'>Connected</Label>
      <div className='flex flex-col gap-1.5'>
        {providers.map((provider) => (
          <div
            key={provider.id}
            className='flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2'
          >
            <div className='flex items-center gap-2.5 min-w-0'>
              <Icon
                icon={Key01Icon}
                size={16}
                className='text-muted-foreground shrink-0'
              />
              <span className='text-sm font-medium truncate'>
                {provider.name}
              </span>
            </div>
            <Button
              variant='ghost'
              size='sm'
              className='text-danger shrink-0'
              isDisabled={disconnectingId === provider.id}
              onPress={() => void handleDisconnect(provider.id)}
            >
              <Icon icon={Logout03Icon} size={14} />
              {disconnectingId === provider.id
                ? 'Disconnecting…'
                : 'Disconnect'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
