import * as React from 'react'
import { toast } from 'sonner'

import { FSNotReadyError } from '@/hooks/useFileSyncWS'
import { type KernelFilesState, useKernelFiles } from '@/hooks/useKernelFiles'
import { useReplicad } from '@/hooks/useReplicad'

import { useEditor } from './editor/context'

export function ReplicadCompiler() {
  const { project, readFile } = useEditor()
  const [fsContent, setFsContent] = React.useState<string | undefined>()

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
  const editorContent = useKernelFiles(selectMainFileContent)

  React.useEffect(() => {
    if (!mainFilePath || editorContent !== undefined) {
      setFsContent(undefined)
      return
    }

    let cancelled = false
    const normalizedPath = mainFilePath.startsWith('/')
      ? mainFilePath.slice(1)
      : mainFilePath

    readFile(normalizedPath)
      .then((content) => {
        if (!cancelled) setFsContent(content)
      })
      .catch((error) => {
        if (cancelled) return
        if (error instanceof FSNotReadyError) return
        toast.error('Failed to read file from remote FS')
      })

    return () => {
      cancelled = true
    }
  }, [mainFilePath, editorContent, readFile])

  const mainFileContent = editorContent ?? fsContent

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

  return null
}
