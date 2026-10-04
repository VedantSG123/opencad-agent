import { TerminalIcon } from '@hugeicons/core-free-icons'
import * as React from 'react'

import { Icon } from '@/components/icons/HugeIcon'
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
    <div className='mt-2 rounded-lg border border-border/80 bg-zinc-950 p-3 font-mono text-[10px] text-zinc-300 shadow-inner dark:bg-black'>
      <div className='mb-2 flex items-center gap-1.5 border-b border-zinc-900 pb-1.5 text-zinc-500 select-none'>
        <Icon icon={TerminalIcon} size={14} className='text-zinc-400' />
        <span className='font-semibold'>Export Output Logs</span>
      </div>
      <div ref={scrollRef} className='h-28 overflow-y-auto pr-3'>
        {logs.length === 0 ? (
          <div className='text-zinc-600 italic'>No logs generated.</div>
        ) : (
          <div className='flex flex-col gap-1'>
            {logs.map((log, index) => (
              <div
                key={`${log.timestamp}-${index}`}
                className={cn(
                  'leading-relaxed whitespace-pre-wrap',
                  log.type === 'error' && 'font-bold text-red-400',
                  log.type === 'warn' && 'text-yellow-400',
                  log.type === 'info' && 'text-blue-400',
                )}
              >
                <span className='mr-1.5 text-zinc-600 select-none'>
                  [{new Date(log.timestamp).toLocaleTimeString()}]
                </span>
                {log.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
