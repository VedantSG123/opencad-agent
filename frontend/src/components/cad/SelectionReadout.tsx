import { Tooltip } from '@heroui/react'
import { MessageAdd01Icon } from '@hugeicons/core-free-icons'
import type { GeometryRef } from 'shared/geometry'
import { factLabel, factValue, geometryRefText } from 'shared/geometry'

import { CopyButton } from '@/components/CopyButton'
import { Icon } from '@/components/icons/HugeIcon'
import { cn } from '@/lib/utils'
import type { SelectedComponent } from '@/types'

import { VIEWPORT_PILL } from './ViewportStatusBar'

const KIND_LABEL: Record<SelectedComponent['kind'], string> = {
  face: 'Face',
  edge: 'Edge',
}

/**
 * What is selected, over the viewport.
 *
 * Shared by both kernels: picking differs between them, but by the time a
 * component has been named there is nothing kernel-specific left to say.
 */
export function SelectionReadout({
  selection,
  onMention,
  className,
}: {
  selection: SelectedComponent | null
  onMention?: (reference: GeometryRef) => void
  className?: string
}) {
  if (!selection) {
    return null
  }

  const { kind, index, subject, geometryType, facts, reference } = selection

  return (
    <div className={cn('relative', className)}>
      {facts && facts.length > 0 && (
        <dl
          className={cn(
            'absolute bottom-full left-0 mb-2 grid min-w-56 grid-cols-[auto_1fr] gap-x-4 gap-y-1',
            'rounded-md border bg-background/80 px-3 py-2 text-xs shadow-sm backdrop-blur-sm select-none',
          )}
        >
          {facts.map((fact) => (
            <div key={fact.name} className='contents'>
              <dt className='text-foreground/50'>{factLabel(fact.name)}</dt>
              <dd className='whitespace-nowrap text-foreground tabular-nums'>
                {factValue(fact)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className={cn(VIEWPORT_PILL, 'gap-1.5 select-none')}>
        <span className='font-medium text-foreground'>
          {KIND_LABEL[kind]} {index}
        </span>
        {geometryType && (
          <>
            <span className='text-foreground/25'>·</span>
            <span className='text-accent'>{geometryType}</span>
          </>
        )}
        {subject && (
          <>
            <span className='text-foreground/25'>·</span>
            <span className='truncate text-foreground/50'>{subject}</span>
          </>
        )}
        {reference && onMention && (
          <AddToChatButton onPress={() => onMention(reference)} />
        )}
        {reference && (
          <CopyButton
            text={geometryRefText(reference)}
            label='Copy reference'
            className='pointer-events-auto -my-1 -mr-2 h-5 w-5'
          />
        )}
      </div>
    </div>
  )
}

function AddToChatButton({ onPress }: { onPress: () => void }) {
  return (
    <Tooltip>
      <button
        type='button'
        aria-label='Add to chat'
        onClick={onPress}
        className='pointer-events-auto -my-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-muted/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none'
      >
        <Icon icon={MessageAdd01Icon} size={14} />
      </button>
      <Tooltip.Content>Add to chat</Tooltip.Content>
    </Tooltip>
  )
}
