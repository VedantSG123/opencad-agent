import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  LoaderCircleIcon,
} from '@hugeicons/core-free-icons'

import { Icon } from '@/components/icons/HugeIcon'

export type ExportPhase = 'idle' | 'exporting' | 'success' | 'error'

/** The spinner every export shares, so one change moves all three kernels. */
export function ExportSpinner({ size = 14 }: { size?: number }) {
  return (
    <Icon
      icon={LoaderCircleIcon}
      size={size}
      className='animate-spin text-muted motion-reduce:animate-none'
    />
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const kilobytes = bytes / 1024
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`
  return `${(kilobytes / 1024).toFixed(1)} MB`
}

/**
 * One line saying what the last export did, under the options it ran with.
 *
 * The form stays on screen through every phase, so this is a status line and
 * not a screen of its own: the format is still visible next to the result.
 */
export function ExportStatusLine({
  phase,
  filename,
  size,
  fileCount = 1,
  error,
}: {
  phase: ExportPhase
  filename: string
  size?: number
  fileCount?: number
  error?: string
}) {
  if (phase === 'idle') return null

  if (phase === 'exporting') {
    return (
      <div role='status' className='flex items-center gap-2 text-xs'>
        <ExportSpinner />
        <span className='text-foreground'>
          Writing <span className='font-mono'>{filename}</span>…
        </span>
      </div>
    )
  }

  if (phase === 'success') {
    return (
      <div role='status' className='flex items-center gap-2 text-xs'>
        <Icon
          icon={CheckmarkCircle02Icon}
          size={14}
          className='shrink-0 text-success'
        />
        <span className='min-w-0 truncate text-foreground'>
          Wrote <span className='font-mono'>{filename}</span>
        </span>
        <span className='shrink-0 text-muted tabular-nums'>
          {fileCount > 1 && `${fileCount} files · `}
          {size !== undefined && formatBytes(size)}
        </span>
      </div>
    )
  }

  return (
    <div role='alert' className='flex flex-col gap-1.5 text-xs'>
      <div className='flex items-center gap-2 font-medium text-danger'>
        <Icon icon={Alert02Icon} size={14} className='shrink-0' />
        Export failed
      </div>
      {error && (
        <pre className='max-h-32 overflow-auto rounded-md bg-danger-soft px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-danger-soft-foreground'>
          {error}
        </pre>
      )}
    </div>
  )
}
