import { ArrowLeftRight, Code2 } from 'lucide-react'
import * as React from 'react'
import * as THREE from 'three'

import { CadViewer } from '@/components-3d/cad-viewer/ReplicadViewer'
import { useKernelFiles } from '@/hooks/useKernelFiles'
import { useReplicad } from '@/hooks/useReplicad'

import { usePanelContext } from '../context/PanelContext'
import { useEditor } from './editor/context'

THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

export function ViewportPanel() {
  const { isFocusMode, setFocusedPanel } = usePanelContext()
  const { project } = useEditor()

  // Convert absolute DB path to the FS-relative path used by the virtual FS
  // e.g. "/home/user/Test/main.js" with dir "/home/user/Test" → "/main.js"
  const mainFilePath = React.useMemo(() => {
    if (
      project?.cad_kernel !== 'replicad' ||
      !project.file ||
      !project.directory
    )
      return null
    const rel = project.file.startsWith(project.directory)
      ? project.file.slice(project.directory.length)
      : null
    if (!rel) return null
    return rel.startsWith('/') ? rel : `/${rel}`
  }, [project])

  const selectMainFileContent = React.useCallback(
    (state: ReturnType<typeof useKernelFiles.getState>) =>
      mainFilePath ? state.files[mainFilePath] : undefined,
    [mainFilePath],
  )
  const mainFileContent = useKernelFiles(selectMainFileContent)

  const shapes = useReplicad((state) => state.shapes)
  const hasError = !!useReplicad((state) => state.error)
  const setCode = useReplicad((state) => state.setCode)
  const build = useReplicad((state) => state.build)
  const initWorker = useReplicad((state) => state.initWorker)
  const workerReady = useReplicad((state) => state.workerReady)

  const isReplicad = project?.cad_kernel === 'replicad'

  React.useEffect(() => {
    if (isReplicad) {
      initWorker()
    }
  }, [initWorker, isReplicad])

  React.useEffect(() => {
    if (!workerReady || mainFileContent === undefined) return

    const timer = setTimeout(() => {
      setCode(mainFileContent)
      build()
    }, 500)

    return () => clearTimeout(timer)
  }, [mainFileContent, workerReady, setCode, build])

  return (
    <div className='h-full flex flex-col bg-card overflow-hidden'>
      <div className='w-full flex justify-end'>
        {isFocusMode && (
          <div className='flex items-center gap-1 border-b px-1 h-10 shrink-0'>
            <button
              onClick={() => setFocusedPanel('editor')}
              className='flex items-center gap-2 px-2 h-7 text-xs rounded-md text-muted-foreground group hover:text-foreground hover:bg-accent/50 transition-colors'
            >
              <ArrowLeftRight className='h-4 w-4 group-hover:text-blue-500' />
              <div className='flex items-center gap-1'>
                <Code2 className='h-3.5 w-3.5' />
                <span>Code Editor</span>
              </div>
            </button>
          </div>
        )}
      </div>
      <div className='flex-1 relative'>
        {isReplicad ? (
          !workerReady ? (
            <div className='absolute inset-0 flex items-center justify-center text-sm text-muted-foreground'>
              Initializing...
            </div>
          ) : (
            <CadViewer shapes={shapes || []} hasError={hasError} />
          )
        ) : (
          <div className='h-full flex items-center justify-center'>
            <span className='text-sm text-muted-foreground'>3D Viewport</span>
          </div>
        )}
      </div>
    </div>
  )
}
