import { Tooltip } from '@heroui/react'
import { CleanIcon, TerminalIcon } from '@hugeicons/core-free-icons'
import * as React from 'react'

import { TitlebarIconButton } from '@/components/custom/TitlebarIconButton'
import { Icon } from '@/components/icons/HugeIcon'
import { XIcon } from '@/components/icons/XIcon'
import { cn } from '@/lib/utils'
import type { LogEntry } from '@/types'

interface ConsoleProps {
  logs: LogEntry[]
  title?: string
  emptyMessage?: string
  /** Omit to hide the clear button — a log nobody owns cannot be cleared. */
  onClear?: () => void
  /** Omit to hide the close button, for a console that is not collapsible. */
  onClose?: () => void
  closeLabel?: string
  className?: string
}

/**
 * A scrolling log view. Presentational only: whoever owns the logs decides what
 * clearing and closing mean, and the auto-scroll is the one behaviour here
 * because it belongs to the scroll container rather than to any caller.
 */
export function Console({
  logs,
  title = 'Execution Console',
  emptyMessage = 'No logs yet. Output logs from your code (if any) will appear here.',
  onClear,
  onClose,
  closeLabel = 'Minimize console',
  className,
}: ConsoleProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-background text-foreground border-t border-border select-text font-sans overflow-hidden',
        className,
      )}
    >
      <div className='flex items-center justify-between px-3 py-1 bg-background-secondary border-b shadow-sm shrink-0 select-none h-8'>
        <div className='flex items-center gap-1.5 text-xs font-semibold text-foreground/60'>
          <Icon icon={TerminalIcon} size={14} className='text-accent' />
          <span>{title}</span>
          {logs.length > 0 && (
            <span className='inline-flex h-2 w-2 rounded-full bg-blue-500 animate-pulse' />
          )}
        </div>
        <div className='flex items-center gap-1'>
          {onClear && (
            <Tooltip>
              <TitlebarIconButton
                onPress={onClear}
                aria-label='Clear console'
                isDisabled={logs.length === 0}
              >
                <Icon icon={CleanIcon} size={14} />
              </TitlebarIconButton>
              <Tooltip.Content>
                <p>Clear console</p>
              </Tooltip.Content>
            </Tooltip>
          )}
          {onClose && (
            <Tooltip>
              <TitlebarIconButton onPress={onClose} aria-label={closeLabel}>
                <XIcon size={14} />
              </TitlebarIconButton>
              <Tooltip.Content>
                <p>{closeLabel}</p>
              </Tooltip.Content>
            </Tooltip>
          )}
        </div>
      </div>

      <div ref={scrollRef} className='flex-1 min-h-0 overflow-y-auto'>
        <div className='p-3 font-mono text-xs leading-relaxed space-y-1.5'>
          {logs.length === 0 ? (
            <div className='h-full flex items-center justify-center text-foreground/60 italic select-none'>
              {emptyMessage}
            </div>
          ) : (
            logs.map((log, index) => {
              const isError = log.type === 'error'
              const isWarn = log.type === 'warn'
              const isInfo = log.type === 'info'

              return (
                <div
                  key={log.timestamp + '-' + index}
                  className={cn(
                    'px-2 py-1 rounded-sm whitespace-pre-wrap break-all border-l-2 border-transparent animate-in fade-in duration-200 slide-in-from-bottom-1',
                    isError && 'bg-danger/10 text-danger border-danger',
                    isWarn &&
                      'bg-warning/10 text-warning dark:text-warning border-warning/80',
                    isInfo && 'text-accent',
                    !isError && !isWarn && !isInfo && 'text-foreground',
                  )}
                >
                  <span className='text-foreground/60 mr-2 select-none'>
                    [{new Date(log.timestamp).toLocaleTimeString()}]
                  </span>
                  {log.text}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
