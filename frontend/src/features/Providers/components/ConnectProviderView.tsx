import { Button, Tabs } from '@heroui/react'
import {
  ArrowLeft02Icon,
  Key01Icon,
  LoginMethodIcon,
} from '@hugeicons/core-free-icons'
import { useState } from 'react'

import { Icon } from '@/components/icons/HugeIcon'
import { cn } from '@/lib/utils'
import type { Provider } from '@/types/provider'

import { ApiKeyConnectForm } from './ApiKeyConnectForm'
import { OAuthConnectFlow } from './OAuthConnectFlow'

interface ConnectProviderViewProps {
  provider: Provider
  className?: string
  onBack: () => void
}

export function ConnectProviderView({
  provider,
  className,
  onBack,
}: ConnectProviderViewProps) {
  const [method, setMethod] = useState<'api_key' | 'oauth'>(
    provider.oauth ? 'oauth' : 'api_key',
  )

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className='flex items-center gap-2'>
        <Button variant='ghost' size='sm' isIconOnly onPress={onBack}>
          <Icon icon={ArrowLeft02Icon} size={16} />
        </Button>
        <div className='flex flex-col gap-0.5'>
          <h3 className='text-base font-semibold text-foreground'>
            Connect {provider.name}
          </h3>
          <p className='text-sm text-muted-foreground'>
            Choose how you&apos;d like to authenticate.
          </p>
        </div>
      </div>

      {provider.oauth ? (
        <Tabs
          selectedKey={method}
          onSelectionChange={(key) => setMethod(key as 'api_key' | 'oauth')}
          className='w-full'
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label='Authentication method'>
              <Tabs.Tab className='gap-1.5' id='oauth'>
                <Icon icon={LoginMethodIcon} size={16} />
                Sign In
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab className='gap-1.5' id='api_key'>
                <Tabs.Separator />
                <Icon icon={Key01Icon} size={16} />
                API Key
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      ) : null}

      {method === 'oauth' && provider.oauth ? (
        <OAuthConnectFlow provider={provider} onDone={onBack} />
      ) : (
        <ApiKeyConnectForm provider={provider} onDone={onBack} />
      )}
    </div>
  )
}
