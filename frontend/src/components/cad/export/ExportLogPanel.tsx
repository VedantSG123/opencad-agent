import * as React from 'react'

import { cn } from '@/lib/utils'
import type { LogEntry } from '@/types'

/**
 * What the kernel said while exporting.
 *
 * Kept as a terminal rather than the themed `Console` the project panel uses:
 * this is a transcript of a tool that ran, and reading it as one is the point.
 * Scrolls itself, because the interesting line is almost always the last.
 */
export function ExportLogPanel({ logs }: { logs: LogEntry[] }) {
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-baseline justify-between text-xs'>
        <span className='font-medium text-muted'>Output</span>
        <span className='text-muted tabular-nums'>
          {logs.length} {logs.length === 1 ? 'line' : 'lines'}
        </span>
      </div>
      <div
        ref={scrollRef}
        className='h-28 overflow-y-auto rounded-md border border-border bg-zinc-950 px-2.5 py-2 font-mono text-[11px] text-zinc-300'
      >
        {logs.length === 0 ? (
          <div className='text-zinc-500'>Waiting for output…</div>
        ) : (
          logs.map((log, index) => (
            <div
              key={`${log.timestamp}-${index}`}
              className={cn(
                'leading-relaxed whitespace-pre-wrap',
                log.type === 'error' && 'text-red-400',
                log.type === 'warn' && 'text-yellow-400',
                log.type === 'info' && 'text-sky-400',
              )}
            >
              <span className='mr-2 text-zinc-600 tabular-nums select-none'>
                {new Date(log.timestamp).toLocaleTimeString([], {
                  hour12: false,
                })}
              </span>
              {log.text}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
