import { Cancel01Icon } from '@hugeicons/core-free-icons'
import type { GeometryRef } from 'shared/geometry'
import { factLabel, geometryRefText, geometryTypeLabel } from 'shared/geometry'

import { Icon } from '@/components/icons/HugeIcon'
import { cn } from '@/lib/utils'

export function GeometryChip({
  reference,
  onRemove,
  className,
}: {
  reference: GeometryRef
  onRemove?: () => void
  className?: string
}) {
  return (
    <span
      title={geometryRefText(reference)}
      className={cn(
        'flex w-fit max-w-full items-center gap-1 rounded border border-separator px-1.5 py-0.5 text-xs text-foreground/70',
        className,
      )}
    >
      <span className='font-medium text-foreground'>
        {factLabel(reference.kind)}
      </span>
      <span className='text-foreground/25'>·</span>
      <span className='text-accent'>{geometryTypeLabel(reference.type)}</span>
      <span className='text-foreground/25'>·</span>
      <span className='truncate'>{reference.part}</span>
      {onRemove && (
        <button
          type='button'
          aria-label={`Remove ${reference.kind} of ${reference.part}`}
          onClick={onRemove}
          className='-mr-1 shrink-0 rounded p-0.5 hover:bg-muted/20'
        >
          <Icon icon={Cancel01Icon} size={12} />
        </button>
      )}
    </span>
  )
}
