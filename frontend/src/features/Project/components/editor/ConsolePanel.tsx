import { ChevronDown, Terminal, Trash2 } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePanelContext } from '@/features/Project/context/PanelContext'
import { type LogEntry, useOpenSCAD } from '@/hooks/useOpenSCAD'
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
    <div className='flex flex-col h-full bg-zinc-950/95 text-zinc-300 border-t border-border select-text font-sans overflow-hidden'>
      {/* Console Header */}
      <div className='flex items-center justify-between px-3 py-1 bg-zinc-900/50 border-b border-border/50 backdrop-blur-sm shrink-0 select-none h-8'>
        <div className='flex items-center gap-1.5 text-xs font-semibold text-zinc-400'>
          <Terminal className='h-3.5 w-3.5 text-blue-500' />
          <span>Execution Console</span>
          {logs.length > 0 && (
            <span className='inline-flex h-2 w-2 rounded-full bg-blue-500 animate-pulse' />
          )}
        </div>
        <div className='flex items-center gap-1'>
          <Button
            variant='ghost'
            size='icon'
            onClick={clearLogs}
            className='h-6 w-6 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-md transition-colors'
            title='Clear console'
            disabled={logs.length === 0}
          >
            <Trash2 className='h-3.5 w-3.5' />
          </Button>
          <Button
            variant='ghost'
            size='icon'
            onClick={toggleConsole}
            className='h-6 w-6 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-md transition-colors'
            title='Minimize console'
          >
            <ChevronDown className='h-4 w-4' />
          </Button>
        </div>
      </div>

      {/* Console Output Scroll Area */}
      <ScrollArea ref={scrollRef} className='flex-1 min-h-0'>
        <div className='p-3 font-mono text-xs leading-relaxed space-y-1.5'>
          {logs.length === 0 ? (
            <div className='h-full flex items-center justify-center text-zinc-500 italic select-none'>
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
                    isError &&
                      'bg-rose-500/10 text-rose-400 border-rose-500/80',
                    isWarn &&
                      'bg-amber-500/10 text-amber-400 border-amber-500/80',
                    isInfo && 'text-sky-400',
                    !isError && !isWarn && !isInfo && 'text-zinc-300',
                  )}
                >
                  <span className='text-zinc-600 mr-2 select-none'>
                    [{new Date(log.timestamp).toLocaleTimeString()}]
                  </span>
                  {log.text}
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function OpenSCADConsolePanel() {
  const logs = useOpenSCAD((state) => state.logs)
  const clearLogs = useOpenSCAD((state) => state.clearLogs)
  const error = useOpenSCAD((state) => state.error)

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
