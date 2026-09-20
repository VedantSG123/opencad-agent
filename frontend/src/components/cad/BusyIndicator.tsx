import { cn } from '@/lib/utils'

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
        'absolute bottom-4 right-4 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border shadow-sm flex items-center gap-2 text-xs text-foreground/60 animate-in fade-in duration-200',
        className,
      )}
    >
      <div className='h-2 w-2 bg-blue-500 rounded-full animate-pulse' />
      {label}
    </div>
  )
}
