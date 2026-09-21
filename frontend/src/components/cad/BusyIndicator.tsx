import { cn } from '@/lib/utils'

import { VIEWPORT_PILL } from './ViewportStatusBar'

/**
 * The kernel is working, over the viewport.
 *
 * Shared so the kernels cannot drift apart on it: they do the same thing -
 * turn the open script into geometry - and an indicator that looked different
 * per kernel would read as a different kind of activity.
 */
export function BusyIndicator({
  active,
  label,
  className,
}: {
  active: boolean
  label: string
  className?: string
}) {
  if (!active) {
    return null
  }

  return (
    <div
      className={cn(
        VIEWPORT_PILL,
        'animate-in fade-in duration-200',
        className,
      )}
    >
      <div className='h-2 w-2 bg-blue-500 rounded-full animate-pulse' />
      {label}
    </div>
  )
}
