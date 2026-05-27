import { useOpenSCAD } from '@/hooks/useOpenSCAD'
import { useReplicad } from '@/hooks/useReplicad'

import { useEditor } from './context'

export function useConsoleLogs() {
  const { project } = useEditor()
  const isReplicad = project?.cad_kernel === 'replicad'

  const replicadLogs = useReplicad((state) => state.logs)
  const clearReplicadLogs = useReplicad((state) => state.clearLogs)
  const replicadError = useReplicad((state) => state.error)

  const openscadLogs = useOpenSCAD((state) => state.logs)
  const clearOpenscadLogs = useOpenSCAD((state) => state.clearLogs)
  const openscadError = useOpenSCAD((state) => state.error)

  const logs = isReplicad ? replicadLogs : openscadLogs
  const clearLogs = isReplicad ? clearReplicadLogs : clearOpenscadLogs
  const error = isReplicad ? replicadError : openscadError

  return { logs, clearLogs, error }
}
