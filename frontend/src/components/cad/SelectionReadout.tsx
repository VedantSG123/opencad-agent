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
  className,
}: {
  selection: SelectedComponent | null
  className?: string
}) {
  if (!selection) {
    return null
  }

  const { kind, index, subject, geometryType } = selection

  return (
    <div className={cn(VIEWPORT_PILL, 'gap-1.5 select-none', className)}>
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
    </div>
  )
}
