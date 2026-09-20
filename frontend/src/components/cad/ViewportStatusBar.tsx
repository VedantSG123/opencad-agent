import type * as React from 'react'

import { cn } from '@/lib/utils'

/** The chrome every viewport status control shares, so they read as one row. */
export const VIEWPORT_PILL =
  'bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border shadow-sm flex items-center gap-2 text-xs text-foreground/60'

/**
 * The row along the bottom of a viewport: reset, what is selected, what the
 * kernel is doing.
 *
 * Stops short of the right edge because the view gizmo owns that corner, and
 * passes pointer events through except on the controls themselves - the gap
 * between them is still viewport, and dragging it should orbit.
 */
export function ViewportStatusBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'absolute bottom-4 left-4 right-36 z-10',
        'flex flex-wrap items-center gap-2 pointer-events-none',
      )}
    >
      {children}
    </div>
  )
}
