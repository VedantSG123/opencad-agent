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
  const checkSyntax = useOpenSCAD((state) => state.checkSyntax)

  const syntaxTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const renderTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  React.useEffect(() => {
    if (!mainFilePath || !mainFileContent) return

    if (syntaxTimerRef.current) clearTimeout(syntaxTimerRef.current)
    if (renderTimerRef.current) clearTimeout(renderTimerRef.current)

    // Fast syntax validation triggers almost instantly (150ms)
    syntaxTimerRef.current = setTimeout(() => {
      checkSyntax({ path: mainFilePath, code: mainFileContent }, remoteFsUrl)
    }, 150)

    // Full 3D rendering compilation triggers when typing stops for 1 second (1000ms)
    renderTimerRef.current = setTimeout(() => {
      compile({ path: mainFilePath, code: mainFileContent }, remoteFsUrl)
    }, 1000)

    return () => {
      if (syntaxTimerRef.current) clearTimeout(syntaxTimerRef.current)
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current)
    }
  }, [files, mainFilePath, mainFileContent, remoteFsUrl, checkSyntax, compile])

  return null
}
