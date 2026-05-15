import { CadViewer } from '@/components-3d/cad-viewer/ReplicadViewer'
import { useReplicad } from '@/hooks/useReplicad'

import { ReplicadCompiler } from './ReplicadCompiler'

export function ReplicadViewport() {
  const shapes = useReplicad((state) => state.shapes)
  const hasError = !!useReplicad((state) => state.error)
  const workerReady = useReplicad((state) => state.workerReady)

  return (
    <>
      <ReplicadCompiler />
      {!workerReady && (
        <div className='absolute inset-0 flex items-center justify-center text-sm text-muted-foreground'>
          Initializing Replicad...
        </div>
      )}
      {workerReady && <CadViewer shapes={shapes || []} hasError={hasError} />}
    </>
  )
}
