import * as React from 'react'

import { OpenSCADViewer } from '@/components-3d/cad-viewer/OpenSCADViewer'
import { type KernelFilesState, useKernelFiles } from '@/hooks/useKernelFiles'
import { OpenSCADProvider, useOpenSCAD } from '@/hooks/useOpenSCAD'
import { toFsPath } from '@/lib/utils'
import { getBaseWsUrl } from '@/utils/getWsBaseUrl'

import { useEditor } from './editor/context'

function OpenSCADViewportInner() {
  const { project } = useEditor()

  const mainFilePath = React.useMemo(() => {
    if (!project?.file || !project.directory) return null
    return toFsPath(project.directory, project.file)
  }, [project])

  const selectMainFileContent = React.useCallback(
    (state: KernelFilesState) =>
      mainFilePath ? state.files[mainFilePath]?.content : null,
    [mainFilePath],
  )
  const mainFileContent = useKernelFiles(selectMainFileContent)

  const remoteFsUrl = React.useMemo(() => {
    return `${getBaseWsUrl()}/ws/sync?projectId=${project.id}`
  }, [project])

  const result = useOpenSCAD((state) => state.result)
  const error = useOpenSCAD((state) => state.error)
  const compile = useOpenSCAD((state) => state.compile)
  const isCompiling = useOpenSCAD((state) => state.isCompiling)

  const hasError = Boolean(error)

  React.useEffect(() => {
    if (!mainFileContent || !mainFilePath) return

    const timer = setTimeout(() => {
      compile(
        {
          path: mainFilePath,
          code: mainFileContent,
        },
        remoteFsUrl,
      )
    }, 500)

    return () => clearTimeout(timer)
  }, [mainFileContent, compile, mainFilePath, remoteFsUrl])

  React.useEffect(() => {
    console.log('Error details:', error)
  }, [error])

  return (
    <div className='relative h-full w-full'>
      <OpenSCADViewer result={result} hasError={hasError} />
      {isCompiling && (
        <div className='absolute bottom-4 right-4 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border shadow-sm flex items-center gap-2 text-xs text-muted-foreground animate-in fade-in duration-200'>
          <div className='h-2 w-2 bg-blue-500 rounded-full animate-pulse' />
          Compiling...
        </div>
      )}
    </div>
  )
}

export function OpenSCADViewport() {
  return (
    <OpenSCADProvider>
      <OpenSCADViewportInner />
    </OpenSCADProvider>
  )
}
