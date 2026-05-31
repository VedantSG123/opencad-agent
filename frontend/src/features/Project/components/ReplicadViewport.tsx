import { SlidersHorizontal } from 'lucide-react'
import * as React from 'react'

import { CadViewer } from '@/components-3d/cad-viewer/ReplicadViewer'
import { useReplicad } from '@/hooks/useReplicad'
import { cn } from '@/lib/utils'

import { ReplicadParametersPanel } from './editor/ReplicadParametersPanel'
import { ReplicadCompiler } from './ReplicadCompiler'

export function ReplicadViewport() {
  const shapes = useReplicad((state) => state.shapes)
  const hasError = !!useReplicad((state) => state.error)
  const workerReady = useReplicad((state) => state.workerReady)
  const defaultParams = useReplicad((state) => state.defaultParams)
  const build = useReplicad((state) => state.build)
  const [resetView, setResetView] = React.useState<(() => void) | null>(null)
  const [showParams, setShowParams] = React.useState(true)

  const hasParams = React.useMemo(() => {
    return defaultParams ? Object.keys(defaultParams).length > 0 : false
  }, [defaultParams])

  const vars = React.useMemo(() => {
    const v: Record<string, unknown> = {}
    for (const [key, config] of Object.entries(defaultParams || {})) {
      v[key] = (config as Record<string, unknown>)?.value
    }
    return v
  }, [defaultParams])

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
      {/* Viewport Ribbon Bar */}
      {workerReady && hasParams && (
        <div className='absolute top-2 left-2 right-2 z-20 flex justify-end gap-2 pointer-events-none'>
          <button
            onClick={() => setShowParams((prev) => !prev)}
            className={cn(
              'pointer-events-auto bg-background/80 backdrop-blur-sm p-1.5 rounded-md border shadow-sm flex items-center gap-2 text-xs transition-colors hover:text-foreground',
              showParams
                ? 'text-foreground border-blue-500/50 bg-blue-500/10'
                : 'text-muted-foreground',
            )}
            title='Toggle parameters panel'
          >
            <SlidersHorizontal className='h-3.5 w-3.5' />
          </button>
        </div>
      )}
      {/* Floating Parameters Panel */}
      {workerReady && hasParams && defaultParams && showParams && (
        <div className='absolute z-10 top-8 right-0'>
          <ReplicadParametersPanel
            defaultParams={defaultParams}
            vars={vars}
            onApply={build}
          />
        </div>
      )}
    </div>
  )
}
