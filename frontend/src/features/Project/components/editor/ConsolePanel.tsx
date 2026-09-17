import * as React from 'react'

import { Console } from '@/components/console/Console'
import { usePanelContext } from '@/features/Project/context/PanelContext'
import { useNodeOpenSCAD } from '@/hooks/useNodeOpenSCAD'
import { useReplicad } from '@/hooks/useReplicad'
import type { LogEntry } from '@/types'

import { useEditor } from './context'

interface KernelConsoleProps {
  logs: LogEntry[]
  clearLogs: () => void
  error: Error | null
}

/**
 * The project console: a `Console` bound to the panel it lives in. The
 * collapse behaviour is this panel's rather than the component's, which is why
 * the console itself knows nothing about it.
 */
function KernelConsole({ logs, clearLogs, error }: KernelConsoleProps) {
  const { toggleConsole, isConsoleCollapsed } = usePanelContext()

  React.useEffect(() => {
    if (error && isConsoleCollapsed) {
      toggleConsole()
    }
  }, [error, isConsoleCollapsed, toggleConsole])

  return <Console logs={logs} onClear={clearLogs} onClose={toggleConsole} />
}

function OpenSCADConsolePanel() {
  const logs = useNodeOpenSCAD((state) => state.logs)
  const clearLogs = useNodeOpenSCAD((state) => state.clearLogs)
  const error = useNodeOpenSCAD((state) => state.error)

  return <KernelConsole logs={logs} clearLogs={clearLogs} error={error} />
}

function ReplicadConsolePanel() {
  const logs = useReplicad((state) => state.logs)
  const clearLogs = useReplicad((state) => state.clearLogs)
  const error = useReplicad((state) => state.error)

  return <KernelConsole logs={logs} clearLogs={clearLogs} error={error} />
}

export function ConsolePanel() {
  const { project } = useEditor()

  if (project?.cad_kernel === 'replicad') {
    return <ReplicadConsolePanel />
  }

  if (project?.cad_kernel === 'openscad') {
    return <OpenSCADConsolePanel />
  }

  return <KernelConsole logs={[]} clearLogs={() => {}} error={null} />
}
