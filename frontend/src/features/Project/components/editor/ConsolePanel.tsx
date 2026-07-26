import { Tooltip } from '@heroui/react'
import { CleanIcon, TerminalIcon } from '@hugeicons/core-free-icons'
import * as React from 'react'

import { TitlebarIconButton } from '@/components/custom/TitlebarIconButton'
import { Icon } from '@/components/icons/HugeIcon'
import { XIcon } from '@/components/icons/XIcon'
import { usePanelContext } from '@/features/Project/context/PanelContext'
import { type LogEntry, useNodeOpenSCAD } from '@/hooks/useNodeOpenSCAD'
import { useReplicad } from '@/hooks/useReplicad'
import { cn } from '@/lib/utils'

import { useEditor } from './context'

interface ConsolePanelBaseProps {
  logs: LogEntry[]
  clearLogs: () => void
  error: Error | null
}

function ConsolePanelBase({ logs, clearLogs, error }: ConsolePanelBaseProps) {
  const { toggleConsole, isConsoleCollapsed } = usePanelContext()
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom of logs on update
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  // Auto-expand console when a new error occurs
  React.useEffect(() => {
    if (error && isConsoleCollapsed) {
      toggleConsole()
    }
  }, [error, isConsoleCollapsed, toggleConsole])

  return (
    <div className='flex flex-col h-full bg-background text-foreground border-t border-border select-text font-sans overflow-hidden'>
      {/* Console Header */}
      <div className='flex items-center justify-between px-3 py-1 bg-background-secondary border-b shadow-sm shrink-0 select-none h-8'>
        <div className='flex items-center gap-1.5 text-xs font-semibold text-foreground/60'>
          <Icon icon={TerminalIcon} size={14} className='text-accent' />
          <span>Execution Console</span>
          {logs.length > 0 && (
            <span className='inline-flex h-2 w-2 rounded-full bg-blue-500 animate-pulse' />
          )}
        </div>
        <div className='flex items-center gap-1'>
          <Tooltip>
            <TitlebarIconButton
              onPress={clearLogs}
              aria-label='Clear console'
              isDisabled={logs.length === 0}
            >
              <Icon icon={CleanIcon} size={14} />
            </TitlebarIconButton>
            <Tooltip.Content>
              <p>Clear console</p>
            </Tooltip.Content>
          </Tooltip>
          <Tooltip>
            <TitlebarIconButton
              onPress={toggleConsole}
              aria-label='Minimize console'
            >
              <XIcon size={14} />
            </TitlebarIconButton>
            <Tooltip.Content>
              <p>Minimize console</p>
            </Tooltip.Content>
          </Tooltip>
        </div>
      </div>

      {/* Console Output Scroll Area */}
      <div ref={scrollRef} className='flex-1 min-h-0 overflow-y-auto'>
        <div className='p-3 font-mono text-xs leading-relaxed space-y-1.5'>
          {logs.length === 0 ? (
            <div className='h-full flex items-center justify-center text-foreground/60 italic select-none'>
              {`No logs yet. Output logs from your code (if any) will appear here.`}
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

function OpenSCADConsolePanel() {
  const logs = useNodeOpenSCAD((state) => state.logs)
  const clearLogs = useNodeOpenSCAD((state) => state.clearLogs)
  const error = useNodeOpenSCAD((state) => state.error)

  return <ConsolePanelBase logs={logs} clearLogs={clearLogs} error={error} />
}

function ReplicadConsolePanel() {
  const logs = useReplicad((state) => state.logs)
  const clearLogs = useReplicad((state) => state.clearLogs)
  const error = useReplicad((state) => state.error)

  return <ConsolePanelBase logs={logs} clearLogs={clearLogs} error={error} />
}

export function ConsolePanel() {
  const { project } = useEditor()

  if (project?.cad_kernel === 'replicad') {
    return <ReplicadConsolePanel />
  }

  return <OpenSCADConsolePanel />
}
