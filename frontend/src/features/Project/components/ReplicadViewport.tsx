import * as React from 'react'

import { CadViewer } from '@/components-3d/cad-viewer/ReplicadViewer'
import { useReplicad } from '@/hooks/useReplicad'

import { ReplicadCompiler } from './ReplicadCompiler'

export function ReplicadViewport() {
  const shapes = useReplicad((state) => state.shapes)
  const hasError = !!useReplicad((state) => state.error)
  const workerReady = useReplicad((state) => state.workerReady)
  const [resetView, setResetView] = React.useState<(() => void) | null>(null)

  return (
    <div className='relative h-full w-full'>
      <ReplicadCompiler />
      {!workerReady && (
        <div className='absolute inset-0 flex items-center justify-center text-sm text-muted-foreground'>
          Initializing Replicad...
        </div>
      )}
      {workerReady && (
        <CadViewer
          shapes={shapes || []}
          hasError={hasError}
          onResetView={setResetView}
        />
      )}
      {resetView && (
        <button
          onClick={resetView}
          className='absolute z-10 bottom-4 left-4 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border shadow-sm flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors'
        >
          Reset View
        </button>
      )}
    </div>
  )
}
