import { SlidersHorizontal } from 'lucide-react'
import * as React from 'react'

import { OpenSCADViewer } from '@/components-3d/cad-viewer/OpenSCADViewer'
import { type KernelFilesState, useKernelFiles } from '@/hooks/useKernelFiles'
import { useOpenSCAD } from '@/hooks/useOpenSCAD'
import { cn, toFsPath } from '@/lib/utils'

import { useEditor } from './editor/context'
import { OpenSCADParametersPanel } from './editor/OpenSCADParametersPanel'
import { OpenSCADCompiler } from './OpenSCADCompiler'

function OpenSCADViewportInner() {
  const result = useOpenSCAD((state) => state.result)
  const error = useOpenSCAD((state) => state.error)
  const isCompiling = useOpenSCAD((state) => state.isCompiling)
  const parameterSet = useOpenSCAD((state) => state.parameterSet)
  const vars = useOpenSCAD((state) => state.vars)
  const setVars = useOpenSCAD((state) => state.setVars)
  const compile = useOpenSCAD((state) => state.compile)

  const [resetView, setResetView] = React.useState<(() => void) | null>(null)
  const [showParams, setShowParams] = React.useState(true)

  const hasError = Boolean(error)

  const { project, readFile } = useEditor()

  const mainFilePath = React.useMemo(() => {
    if (!project?.file || !project.directory) return null
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
      <OpenSCADViewer
        result={result}
        hasError={hasError}
        onResetView={setResetView}
      />
      {resetView && (
        <button
          onClick={resetView}
          className='absolute z-10 bottom-4 left-4 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border shadow-sm flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors'
        >
          Reset View
        </button>
      )}
      {isCompiling && (
        <div className='absolute bottom-4 right-4 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border shadow-sm flex items-center gap-2 text-xs text-muted-foreground animate-in fade-in duration-200'>
          <div className='h-2 w-2 bg-blue-500 rounded-full animate-pulse' />
          Compiling...
        </div>
      )}

      {/* Viewport Ribbon Bar */}
      {hasParams && (
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
      {hasParams && parameterSet && showParams && (
        <div className='absolute z-10 top-8 right-0'>
          <OpenSCADParametersPanel
            parameterSet={parameterSet}
            vars={vars}
            onApply={handleApply}
          />
        </div>
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
