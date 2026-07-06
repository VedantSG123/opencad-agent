import { Download, SlidersHorizontal } from 'lucide-react'
import * as React from 'react'

import { CadViewer } from '@/components-3d/cad-viewer/ReplicadViewer'
import type { StageHandle } from '@/components-3d/helpers/Stage'
import { useReplicad } from '@/hooks/useReplicad'
import { cn } from '@/lib/utils'

import { useEditor } from './editor/context'
import { ReplicadParametersPanel } from './editor/ReplicadParametersPanel'
import { ReplicadCompiler } from './ReplicadCompiler'
import { ReplicadExportDialog } from './ReplicadExportDialog'

export function ReplicadViewport() {
  const { project } = useEditor()
  const shapes = useReplicad((state) => state.shapes)
  const hasError = !!useReplicad((state) => state.error)
  const workerReady = useReplicad((state) => state.workerReady)
  const isCompiling = useReplicad((state) => state.isCompiling)
  const defaultParams = useReplicad((state) => state.defaultParams)
  const build = useReplicad((state) => state.build)
  const stageRef = React.useRef<StageHandle>(null)
  const [showParams, setShowParams] = React.useState(true)
  const [isExportOpen, setIsExportOpen] = React.useState(false)

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
          stageRef={stageRef}
        />
      )}

      <button
        onClick={() => {
          if (stageRef.current && stageRef.current.reset) {
            stageRef.current.reset()
          }
        }}
        className='absolute z-10 bottom-2 left-2 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border shadow-sm flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors'
      >
        Reset View
      </button>

      {isCompiling && (
        <div className='absolute bottom-4 right-4 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border shadow-sm flex items-center gap-2 text-xs text-muted-foreground animate-in fade-in duration-200'>
          <div className='h-2 w-2 bg-blue-500 rounded-full animate-pulse' />
          Compiling...
        </div>
      )}
      {/* Viewport Ribbon Bar */}
      {workerReady && (
        <div className='absolute top-2 left-2 right-2 z-20 flex justify-end gap-2 pointer-events-none'>
          {hasParams && (
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
          )}

          <button
            onClick={() => setIsExportOpen(true)}
            className='pointer-events-auto bg-background/80 backdrop-blur-sm px-2.5 py-1.5 rounded-md border shadow-sm flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-blue-500/50 hover:bg-blue-500/5 transition-all duration-200 cursor-pointer'
            title='Export CAD model'
          >
            <Download className='h-3.5 w-3.5' />
            <span>Export</span>
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

      {/* Export Dialog */}
      {isExportOpen && (
        <ReplicadExportDialog
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          project={project}
          shapes={shapes}
        />
      )}
    </div>
  )
}
