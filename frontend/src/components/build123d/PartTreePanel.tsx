import { ArrowDown01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import * as React from 'react'
import type { ShapeNode } from 'shared/build123d'

import { Icon } from '@/components/icons/HugeIcon'
import type { VisibilityKind, VisibilityMap } from '@/kernels/build123d/tree'
import { leafIds } from '@/kernels/build123d/tree'
import { cn } from '@/lib/utils'

import { PartTree } from './PartTree'

type PartTreePanelProps = {
  tree: ShapeNode
  visibility: VisibilityMap
  onToggle: (ids: string[], kind: VisibilityKind, value: boolean) => void
  selectedId?: string | null
  onSelect?: (node: ShapeNode) => void
  className?: string
}

/**
 * The part tree, floating over the viewport.
 *
 * A sibling of the canvas rather than anything inside it: the tree is DOM, and
 * a pointer that lands here is not a pointer the camera controls should see.
 */
export function PartTreePanel({
  tree,
  visibility,
  onToggle,
  selectedId,
  onSelect,
  className,
}: PartTreePanelProps) {
  const [open, setOpen] = React.useState(true)
  const partCount = React.useMemo(() => leafIds(tree).length, [tree])

  return (
    <div
      className={cn(
        'absolute top-3 left-3 z-10 w-56 overflow-hidden rounded-lg border border-border bg-background/85 shadow-lg backdrop-blur-sm',
        className,
      )}
    >
      <button
        type='button'
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className='flex w-full items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-foreground/70 hover:bg-muted/10'
      >
        <Icon icon={open ? ArrowDown01Icon : ArrowRight01Icon} size={12} />
        <span>Tree</span>
        <span className='ml-auto font-normal text-foreground/40'>
          {partCount} {partCount === 1 ? 'part' : 'parts'}
        </span>
      </button>

      {open && (
        <div className='max-h-[60vh] overflow-y-auto border-t border-border'>
          <PartTree
            tree={tree}
            visibility={visibility}
            onToggle={onToggle}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>
      )}
    </div>
  )
}
