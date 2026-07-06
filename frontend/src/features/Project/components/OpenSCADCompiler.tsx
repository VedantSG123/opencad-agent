import * as React from 'react'
import { toast } from 'sonner'

import { FSNotReadyError } from '@/hooks/useFileSyncWS'
import { type KernelFilesState, useKernelFiles } from '@/hooks/useKernelFiles'
import { useNodeOpenSCAD } from '@/hooks/useNodeOpenSCAD'
import { toFsPath } from '@/lib/utils'

import { useEditor } from './editor/context'

export function OpenSCADCompiler() {
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
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof FSNotReadyError) return
        toast.error('Failed to read file from remote FS')
      })

    return () => {
      cancelled = true
    }
  }, [mainFilePath, editorContent, readFile])

  const mainFileContent = editorContent ?? fsContent

  const scadFilesSerialized = useKernelFiles(
    React.useCallback((state: KernelFilesState) => {
      return Object.entries(state.files)
        .filter(([path]) => path.toLowerCase().endsWith('.scad'))
        .map(([path, file]) => `${path}:${file.content}`)
        .join('\n')
    }, []),
  )
  const compile = useNodeOpenSCAD((state) => state.compile)
  const checkSyntax = useNodeOpenSCAD((state) => state.checkSyntax)

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
      checkSyntax(
        { path: mainFilePath, code: mainFileContent },
        project.directory,
      )
    }, 150)

    // Full 3D rendering compilation triggers when typing stops for 1 second (1000ms)
    renderTimerRef.current = setTimeout(() => {
      compile({ path: mainFilePath, code: mainFileContent }, project.directory)
    }, 1000)

    return () => {
      if (syntaxTimerRef.current) clearTimeout(syntaxTimerRef.current)
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current)
    }
  }, [
    scadFilesSerialized,
    mainFilePath,
    mainFileContent,
    project.directory,
    checkSyntax,
    compile,
  ])

  return null
}
