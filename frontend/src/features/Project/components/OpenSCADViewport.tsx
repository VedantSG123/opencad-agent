import { Button } from '@heroui/react'
import {
  Download04Icon,
  SlidersHorizontalIcon,
} from '@hugeicons/core-free-icons'
import * as React from 'react'

import { Icon } from '@/components/icons/HugeIcon'
import { OpenSCADViewer } from '@/components-3d/cad-viewer/OpenSCADViewer'
import type { StageHandle } from '@/components-3d/helpers/Stage'
import { type KernelFilesState, useKernelFiles } from '@/hooks/useKernelFiles'
import { useNodeOpenSCAD } from '@/hooks/useNodeOpenSCAD'
import { cn, toFsPath } from '@/lib/utils'

import { useEditor } from './editor/context'
import { OpenSCADParametersPanel } from './editor/OpenSCADParametersPanel'
import { OpenSCADCompiler } from './OpenSCADCompiler'
import { OpenSCADExportDialog } from './OpenSCADExportDialog'

function OpenSCADViewportInner() {
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

  const { project, readFile } = useEditor()

  const mainFilePath = React.useMemo(() => {
    if (!project?.file || !project.directory) return null
    if (!project.file.toLowerCase().endsWith('.scad')) return null
    return toFsPath(project.directory, project.file)
  }, [project])

  const selectMainFileContent = React.useCallback(
    (state: KernelFilesState) =>
      mainFilePath ? state.files[mainFilePath]?.content : undefined,
    [mainFilePath],
  )
  const editorContent = useKernelFiles(selectMainFileContent)

  const [fsContent, setFsContent] = React.useState<string | undefined>()

  React.useEffect(() => {
    let cancelled = false
    if (!mainFilePath || editorContent !== undefined) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setFsContent(undefined)
        }
      })
      return
    }

    const normalizedPath = mainFilePath.startsWith('/')
      ? mainFilePath.slice(1)
      : mainFilePath
    readFile(normalizedPath)
      .then((content) => {
        if (!cancelled) setFsContent(content)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Failed to read file from remote FS:', error)
      })

    return () => {
      cancelled = true
    }
  }, [mainFilePath, editorContent, readFile])

  const mainFileContent = editorContent ?? fsContent

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

      <Button
        onPress={() => {
          if (stageRef.current && stageRef.current.reset) {
            stageRef.current.reset()
          }
        }}
        size='sm'
        className='absolute z-10 bottom-4 left-4 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border shadow-sm flex items-center gap-2 text-xs text-foreground/60 hover:text-foreground transition-colors min-w-0 h-auto'
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
  return (
    <>
      <OpenSCADCompiler />
      <OpenSCADViewportInner />
    </>
  )
}
