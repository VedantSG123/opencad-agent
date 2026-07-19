import { Button } from '@heroui/react'
import {
  Download04Icon,
  SlidersHorizontalIcon,
} from '@hugeicons/core-free-icons'
import * as React from 'react'

import { Icon } from '@/components/icons/HugeIcon'
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
        <div className='absolute inset-0 flex items-center justify-center text-sm text-foreground/60'>
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

      <Button
        onPress={() => {
          if (stageRef.current && stageRef.current.reset) {
            stageRef.current.reset()
          }
        }}
        size='sm'
        className='absolute z-10 bottom-2 left-2 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border shadow-sm flex items-center gap-2 text-xs text-foreground/60 hover:text-foreground transition-colors min-w-0 h-auto'
      >
        Reset View
      </Button>

      {isCompiling && (
        <div className='absolute bottom-4 right-4 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border shadow-sm flex items-center gap-2 text-xs text-foreground/60 animate-in fade-in duration-200'>
          <div className='h-2 w-2 bg-blue-500 rounded-full animate-pulse' />
          Compiling...
        </div>
      )}
      {/* Viewport Ribbon Bar */}
      {workerReady && (
        <div className='absolute top-2 left-2 right-2 z-20 flex justify-end gap-2 pointer-events-none'>
          {hasParams && (
            <Button
              onPress={() => setShowParams((prev) => !prev)}
              isIconOnly
              size='sm'
              className={cn(
                'pointer-events-auto bg-background/80 backdrop-blur-sm rounded-md border shadow-sm flex items-center justify-center transition-colors hover:text-foreground min-w-0 h-8 w-8',
                showParams
                  ? 'text-foreground border-2 border-accent bg-accent/10'
                  : 'text-foreground/60',
              )}
              aria-label='Toggle parameters panel'
            >
              <Icon icon={SlidersHorizontalIcon} size={14} />
            </Button>
          )}

          <Button
            onPress={() => setIsExportOpen(true)}
            size='sm'
            className='pointer-events-auto rounded-lg'
            variant='primary'
            aria-label='Export CAD model'
          >
            <Icon icon={Download04Icon} size={14} />
            <span>Export</span>
          </Button>
        </div>
      )}
      {/* Floating Parameters Panel */}
      {workerReady && hasParams && defaultParams && showParams && (
        <div className='absolute z-10 top-10 right-0'>
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
