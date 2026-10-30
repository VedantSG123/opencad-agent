import { Button } from '@heroui/react'
import { SlidersHorizontalIcon } from '@hugeicons/core-free-icons'
import * as React from 'react'

import { OpenSCADViewer } from '@/components-3d/cad-viewer/OpenSCADViewer'
import type { StageHandle } from '@/components-3d/helpers/Stage'
import { BusyIndicator } from '@/components/cad/BusyIndicator'
import { ExportButton } from '@/components/cad/export/ExportButton'
import { ResetViewButton } from '@/components/cad/ResetViewButton'
import { ViewportStatusBar } from '@/components/cad/ViewportStatusBar'
import { Icon } from '@/components/icons/HugeIcon'
import { useNodeOpenSCAD } from '@/hooks/useNodeOpenSCAD'
import { cn } from '@/lib/utils'

import { useEditor } from './editor/context'
import { OpenSCADParametersPanel } from './editor/OpenSCADParametersPanel'
import { OpenSCADCompiler, useOpenSCADMainFile } from './OpenSCADCompiler'
import { OpenSCADExportDialog } from './OpenSCADExportDialog'

function OpenSCADViewportInner({
  mainFilePath,
  mainFileContent,
}: {
  mainFilePath: string | null
  mainFileContent: string | undefined
}) {
  const result = useNodeOpenSCAD((state) => state.result)
  const error = useNodeOpenSCAD((state) => state.error)
  const isCompiling = useNodeOpenSCAD((state) => state.isCompiling)
  const parameterSet = useNodeOpenSCAD((state) => state.parameterSet)
  const vars = useNodeOpenSCAD((state) => state.vars)
  const setVars = useNodeOpenSCAD((state) => state.setVars)
  const compile = useNodeOpenSCAD((state) => state.compile)
  const stageRef = React.useRef<StageHandle>(null)
  const [showParams, setShowParams] = React.useState(true)
  const [isExportOpen, setIsExportOpen] = React.useState(false)

  const hasError = Boolean(error)

  const { project } = useEditor()

  const hasParams = React.useMemo(() => {
    return parameterSet ? (parameterSet.parameters?.length ?? 0) > 0 : false
  }, [parameterSet])

  const handleApply = React.useCallback(
    (nextVars: Record<string, unknown>) => {
      setVars(nextVars)
      if (mainFilePath && mainFileContent) {
        compile(
          { path: mainFilePath, code: mainFileContent },
          project.directory,
        )
      }
    },
    [setVars, compile, mainFilePath, mainFileContent, project.directory],
  )

  React.useEffect(() => {
    if (error) {
      console.error('OpenSCAD compilation error:', error)
    }
  }, [error])

  return (
    <div className='relative h-full w-full'>
      <OpenSCADViewer result={result} hasError={hasError} stageRef={stageRef} />

      <ViewportStatusBar>
        <ResetViewButton stageRef={stageRef} />
        <BusyIndicator active={isCompiling} label='Compiling...' />
      </ViewportStatusBar>

      {/* Viewport Ribbon Bar */}
      {result && (
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

          <ExportButton onPress={() => setIsExportOpen(true)} />
        </div>
      )}

      {/* Floating Parameters Panel */}
      {hasParams && parameterSet && showParams && (
        <div className='absolute z-10 top-10 right-0'>
          <OpenSCADParametersPanel
            parameterSet={parameterSet}
            vars={vars}
            onApply={handleApply}
          />
        </div>
      )}

      {/* Export Dialog */}
      {isExportOpen && (
        <OpenSCADExportDialog
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          project={project}
          result={result}
          mainFilePath={mainFilePath}
          mainFileContent={mainFileContent}
        />
      )}
    </div>
  )
}

export function OpenSCADViewport() {
  const { mainFilePath, mainFileContent } = useOpenSCADMainFile()

  return (
    <>
      <OpenSCADCompiler
        mainFilePath={mainFilePath}
        mainFileContent={mainFileContent}
      />
      <OpenSCADViewportInner
        mainFilePath={mainFilePath}
        mainFileContent={mainFileContent}
      />
    </>
  )
}
