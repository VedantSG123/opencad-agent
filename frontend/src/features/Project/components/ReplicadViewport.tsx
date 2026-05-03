import * as React from 'react'

import { CadViewer } from '@/components-3d/cad-viewer/ReplicadViewer'
import { type KernelFilesState, useKernelFiles } from '@/hooks/useKernelFiles'
import { useReplicad } from '@/hooks/useReplicad'

import { useEditor } from './editor/context'

export function ReplicadViewport() {
  const { project } = useEditor()

  // Convert absolute DB path to the FS-relative path used by the virtual FS
  const mainFilePath = React.useMemo(() => {
    if (!project?.file || !project.directory) return null
    const rel = project.file.startsWith(project.directory)
      ? project.file.slice(project.directory.length)
      : null
    if (!rel) return null
    return rel.startsWith('/') ? rel : `/${rel}`
  }, [project])

  const selectMainFileContent = React.useCallback(
    (state: KernelFilesState) =>
      mainFilePath ? state.files[mainFilePath]?.content : undefined,
    [mainFilePath],
  )
  const mainFileContent = useKernelFiles(selectMainFileContent)

  const shapes = useReplicad((state) => state.shapes)
  const hasError = !!useReplicad((state) => state.error)
  const setCode = useReplicad((state) => state.setCode)
  const build = useReplicad((state) => state.build)
  const initWorker = useReplicad((state) => state.initWorker)
  const workerReady = useReplicad((state) => state.workerReady)

  React.useEffect(() => {
    initWorker()
  }, [initWorker])

  React.useEffect(() => {
    if (!workerReady || mainFileContent === undefined) return

    const timer = setTimeout(() => {
      setCode(mainFileContent)
      build()
    }, 500)

    return () => clearTimeout(timer)
  }, [mainFileContent, workerReady, setCode, build])

  if (!workerReady) {
    return (
      <div className='absolute inset-0 flex items-center justify-center text-sm text-muted-foreground'>
        Initializing Replicad...
      </div>
    )
  }

  return <CadViewer shapes={shapes || []} hasError={hasError} />
}
