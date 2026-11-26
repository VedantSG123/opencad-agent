import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { factLabel, geometryRefText, geometryTypeLabel } from 'shared/geometry'
import type { Reference } from 'shared/references'

import { Icon } from '@/components/icons/HugeIcon'
import { cn } from '@/lib/utils'

export function ReferenceChip({
  reference,
  onRemove,
  className,
}: {
  reference: Reference
  onRemove?: () => void
  className?: string
}) {
  const { kind, name, detail, title } = describe(reference)
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded border border-separator px-1.5 py-0.5 align-middle text-xs text-foreground/70',
        className,
      )}
    >
      <span className='font-medium text-foreground'>{kind}</span>
      {detail && (
        <>
          <span className='text-foreground/25'>·</span>
          <span className='text-accent'>{detail}</span>
        </>
      )}
      <span className='text-foreground/25'>·</span>
      <span className='truncate'>{name}</span>
      {onRemove && (
        <button
          type='button'
          aria-label={`Remove ${kind.toLowerCase()} ${name}`}
          onClick={onRemove}
          className='-mr-1 shrink-0 rounded p-0.5 hover:bg-muted/20'
        >
          <Icon icon={Cancel01Icon} size={12} />
        </button>
      )}
    </span>
  )
}

function describe(reference: Reference): {
  kind: string
  detail?: string
  name: string
  title: string
} {
  switch (reference.kind) {
    case 'face':
    case 'edge':
      return {
        kind: factLabel(reference.kind),
        detail: geometryTypeLabel(reference.type),
        name: reference.part,
        title: geometryRefText(reference),
      }
    case 'part':
      return { kind: 'Part', name: reference.part, title: reference.part }
    case 'file':
      return {
        kind: 'File',
        name: reference.path.split('/').at(-1) ?? reference.path,
        title: reference.path,
      }
  }
}
