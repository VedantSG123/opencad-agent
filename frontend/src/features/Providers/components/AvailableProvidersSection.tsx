import { Button, Input, Label } from '@heroui/react'
import { ArrowRight02Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { useState } from 'react'

import { Icon } from '@/components/icons/HugeIcon'
import type { Provider } from '@/types/provider'

import { ProviderLogo } from './ProviderLogo'

interface AvailableProvidersSectionProps {
  providers: Provider[]
  onConnect: (providerId: string) => void
}

export function AvailableProvidersSection({
  providers,
  onConnect,
}: AvailableProvidersSectionProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredProviders = providers.filter((provider) =>
    provider.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className='flex flex-col gap-2'>
      <Label className='text-sm font-medium'>Available</Label>

      <div className='relative'>
        <Input
          aria-label='Search providers'
          placeholder='Search providers...'
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className='w-full pl-9'
        />
        <Icon
          icon={Search01Icon}
          size={16}
          className='absolute left-3 top-1/2 -translate-y-1/2 text-default-400 pointer-events-none'
        />
      </div>

      <div className='flex flex-col gap-1.5'>
        {filteredProviders.length === 0 ? (
          <p className='text-sm text-muted-foreground py-2'>
            No providers match &quot;{searchQuery}&quot;.
          </p>
        ) : (
          filteredProviders.map((provider) => (
            <div
              key={provider.id}
              className='flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2'
            >
              <div className='flex items-center gap-2.5 min-w-0'>
                <ProviderLogo providerId={provider.id} size={16} />
                <span className='text-sm font-medium truncate'>
                  {provider.name}
                </span>
              </div>
              <Button
                variant='outline'
                size='sm'
                className='shrink-0'
                onPress={() => onConnect(provider.id)}
              >
                Connect
                <Icon icon={ArrowRight02Icon} size={14} />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
