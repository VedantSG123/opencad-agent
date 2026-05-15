import * as React from 'react'
import { toast } from 'sonner'

import { FSNotReadyError } from '@/hooks/useFileSyncWS'
import { type KernelFilesState, useKernelFiles } from '@/hooks/useKernelFiles'
import { useOpenSCAD } from '@/hooks/useOpenSCAD'
import { toFsPath } from '@/lib/utils'
import { getBaseWsUrl } from '@/utils/getWsBaseUrl'

import { useEditor } from './editor/context'

export function OpenSCADCompiler() {
  const { project, readFile } = useEditor()

  const mainFilePath = React.useMemo(() => {
    if (!project?.file || !project.directory) return null
    return toFsPath(project.directory, project.file)
  }, [project])

  const remoteFsUrl = React.useMemo(() => {
    return `${getBaseWsUrl()}/ws/sync?projectId=${project.id}`
  }, [project])

  const selectMainFileContent = React.useCallback(
    (state: KernelFilesState) =>
      mainFilePath ? state.files[mainFilePath]?.content : undefined,
    [mainFilePath],
  )
  const editorContent = useKernelFiles(selectMainFileContent)

  const [fsContent, setFsContent] = React.useState<string | undefined>()

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

  const files = useKernelFiles((state) => state.files)
  const compile = useOpenSCAD((state) => state.compile)

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    if (!mainFilePath || !mainFileContent) return

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      compile({ path: mainFilePath, code: mainFileContent }, remoteFsUrl)
    }, 150)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [files, mainFilePath, mainFileContent, remoteFsUrl, compile])

  return null
}
