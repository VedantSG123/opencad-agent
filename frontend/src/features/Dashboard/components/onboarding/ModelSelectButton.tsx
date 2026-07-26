import {
  Button,
  Disclosure,
  Input,
  ListBox,
  Modal,
  Popover,
  ScrollShadow,
} from '@heroui/react'
import { AiChipIcon, Search01Icon } from '@hugeicons/core-free-icons'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Icon } from '@/components/icons/HugeIcon'
import { ProviderLogo } from '@/features/Providers/components/ProviderLogo'
import { ProvidersPanel } from '@/features/Providers/components/ProvidersPanel'
import { useAuthenticatedProviders, useProviders } from '@/hooks/useProviders'
import { cn } from '@/lib/utils'
import type { Model, Provider } from '@/types/provider'

export interface SelectedModel {
  providerId: string
  modelId: string
}

interface ModelSelectButtonProps {
  value: SelectedModel | null
  onChange: (value: SelectedModel) => void
  preferredModel?: SelectedModel
}

function matchesText(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase())
}

function highlightMatch(text: string, query: string): ReactNode {
  if (!query) return text
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index === -1) return text

  return (
    <>
      {text.slice(0, index)}
      <mark className='rounded-sm bg-accent/20 text-accent'>
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  )
}

interface ProviderGroupProps {
  provider: Provider
  models: Model[]
  query: string
  isExpanded: boolean
  onExpandedChange: (isExpanded: boolean) => void
  selectedModelId: string | null
  onSelectModel: (modelId: string) => void
}

function ProviderGroup({
  provider,
  models,
  query,
  isExpanded,
  onExpandedChange,
  selectedModelId,
  onSelectModel,
}: ProviderGroupProps) {
  return (
    <Disclosure isExpanded={isExpanded} onExpandedChange={onExpandedChange}>
      <Disclosure.Heading>
        <Disclosure.Trigger className='flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-foreground hover:bg-default-100'>
          <ProviderLogo providerId={provider.id} size={14} />
          <span className='flex-1 truncate text-left'>
            {highlightMatch(provider.name, query)}
          </span>
          <Disclosure.Indicator className='h-3.5 w-3.5 text-muted-foreground' />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <ListBox
          aria-label={`${provider.name} models`}
          selectionMode='single'
          selectedKeys={selectedModelId ? [selectedModelId] : []}
          onSelectionChange={(keys) => {
            const key = [...keys][0]
            if (key !== undefined) onSelectModel(String(key))
          }}
          className='pl-2'
        >
          {models.map((model) => (
            <ListBox.Item
              key={model.id}
              id={model.id}
              textValue={model.name}
              className={cn(
                'rounded-lg text-sm font-normal text-foreground/80',
                selectedModelId === model.id && 'bg-accent-soft',
              )}
            >
              {highlightMatch(model.name, query)}
            </ListBox.Item>
          ))}
        </ListBox>
      </Disclosure.Content>
    </Disclosure>
  )
}

export function ModelSelectButton({
  value,
  onChange,
  preferredModel,
}: ModelSelectButtonProps) {
  const { data: providers } = useProviders()
  const { data: authStatus } = useAuthenticatedProviders()
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [isProvidersModalOpen, setIsProvidersModalOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const hasAppliedPreference = useRef(false)

  const connectedProviders = useMemo(() => {
    const connectedIds = new Set(
      Object.entries(authStatus ?? {})
        .filter(([, status]) => status.authenticated)
        .map(([id]) => id),
    )
    return Object.values(providers ?? {}).filter((p) => connectedIds.has(p.id))
  }, [providers, authStatus])

  // Apply the last-used-model preference once, as soon as we know the
  // preferred provider is actually connected and still offers that model.
  useEffect(() => {
    if (hasAppliedPreference.current || value || !preferredModel) return
    const provider = connectedProviders.find(
      (p) => p.id === preferredModel.providerId,
    )
    if (!provider?.models[preferredModel.modelId]) return

    hasAppliedPreference.current = true
    onChange(preferredModel)
  }, [connectedProviders, preferredModel, value, onChange])

  const trimmedQuery = query.trim()

  const groups = useMemo(() => {
    return connectedProviders
      .map((provider) => {
        const providerMatches =
          trimmedQuery.length > 0 && matchesText(provider.name, trimmedQuery)
        const allModels = Object.values(provider.models)
        const models =
          trimmedQuery.length === 0
            ? allModels
            : providerMatches
              ? allModels
              : allModels.filter((m) => matchesText(m.name, trimmedQuery))
        return { provider, models }
      })
      .filter((group) => group.models.length > 0)
  }, [connectedProviders, trimmedQuery])

  const selectedProvider = value
    ? (providers?.[value.providerId] ?? null)
    : null
  const selectedModel =
    selectedProvider && value ? selectedProvider.models[value.modelId] : null

  function handleSelectModel(providerId: string, modelId: string) {
    onChange({ providerId, modelId })
    setIsPopoverOpen(false)
    setQuery('')
  }

  if (connectedProviders.length === 0) {
    return (
      <>
        <Button
          variant='tertiary'
          size='sm'
          onPress={() => setIsProvidersModalOpen(true)}
        >
          <Icon icon={AiChipIcon} size={16} />
          Select model
        </Button>
        <Modal>
          <Modal.Backdrop
            isOpen={isProvidersModalOpen}
            onOpenChange={setIsProvidersModalOpen}
          >
            <Modal.Container>
              <Modal.Dialog className='dark:shadow-none'>
                <Modal.CloseTrigger />
                <Modal.Body className='p-1'>
                  <ProvidersPanel />
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      </>
    )
  }

  return (
    <Popover isOpen={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <Popover.Trigger>
        <Button variant='tertiary' size='sm'>
          {selectedModel && selectedProvider ? (
            <>
              <ProviderLogo providerId={selectedProvider.id} size={14} />
              <span className='truncate'>{selectedModel.name}</span>
            </>
          ) : (
            <>
              <Icon icon={AiChipIcon} size={16} />
              Select model
            </>
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Content className='flex w-72 flex-col gap-0 p-0'>
        <div className='border-b border-border p-2'>
          <div className='relative'>
            <Input
              aria-label='Search models or providers'
              placeholder='Search models or providers...'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              className='w-full pl-8'
            />
            <Icon
              icon={Search01Icon}
              size={14}
              className='pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-default-400'
            />
          </div>
        </div>
        <ScrollShadow className='max-h-70 overflow-y-auto p-1 rounded-b-3xl'>
          {groups.length === 0 ? (
            <p className='px-2 py-3 text-center text-sm text-muted-foreground'>
              No models match &quot;{trimmedQuery}&quot;.
            </p>
          ) : (
            groups.map(({ provider, models }) => (
              <ProviderGroup
                key={provider.id}
                provider={provider}
                models={models}
                query={trimmedQuery}
                isExpanded={
                  trimmedQuery.length > 0 ? true : expandedIds.has(provider.id)
                }
                onExpandedChange={(isExpanded) => {
                  setExpandedIds((prev) => {
                    const next = new Set(prev)
                    if (isExpanded) next.add(provider.id)
                    else next.delete(provider.id)
                    return next
                  })
                }}
                selectedModelId={
                  value?.providerId === provider.id ? value.modelId : null
                }
                onSelectModel={(modelId) =>
                  handleSelectModel(provider.id, modelId)
                }
              />
            ))
          )}
        </ScrollShadow>
      </Popover.Content>
    </Popover>
  )
}
