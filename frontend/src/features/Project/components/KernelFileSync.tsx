import { useEffect, useRef } from 'react'

import { useKernelFiles } from '@/hooks/useKernelFiles'

import { useEditor } from './editor/context'

/**
 * Headless component that keeps useKernelFiles in sync with the project's main
 * file.  Rendered inside EditorProvider so it can read FS primitives from the
 * editor context without polluting editor state.
 *
 * Priority (highest wins):
 *   1. Live Monaco edits  — pushed by MonacoEditor via onContentChange
 *   2. External disk change while file is not open  — caught by onWatch here
 *   3. Initial load from disk on FS ready           — handled here
 */
// Converts the absolute host path stored in the DB to the FS-relative path used
// by the mounted virtual filesystem (e.g. "/home/user/Test/main.js" → "/main.js")
function toFsPath(projectDir: string, absolutePath: string): string | null {
  if (!absolutePath.startsWith(projectDir)) return null
  const rel = absolutePath.slice(projectDir.length)
  return rel.startsWith('/') ? rel : `/${rel}`
}

export function KernelFileSync() {
  const { project, fsStatus, readFile, onWatch, openTabs, dirtyTabs } =
    useEditor()
  const setFileContent = useKernelFiles((state) => state.setFileContent)

  const mainFile =
    project?.file && project?.directory
      ? toFsPath(project.directory, project.file)
      : null

  // Stable refs so the onWatch callback never captures stale values
  const mainFileRef = useRef(mainFile)
  const readFileRef = useRef(readFile)
  const setFileContentRef = useRef(setFileContent)
  const openTabsRef = useRef(openTabs)
  const dirtyTabsRef = useRef(dirtyTabs)

  useEffect(() => {
    mainFileRef.current = mainFile
  }, [mainFile])
  useEffect(() => {
    readFileRef.current = readFile
  }, [readFile])
  useEffect(() => {
    setFileContentRef.current = setFileContent
  }, [setFileContent])
  useEffect(() => {
    openTabsRef.current = openTabs
  }, [openTabs])
  useEffect(() => {
    dirtyTabsRef.current = dirtyTabs
  }, [dirtyTabs])

  // Initial load: populate kernel files as soon as the FS is ready
  useEffect(() => {
    if (!mainFile || fsStatus !== 'ready') return
    let cancelled = false
    readFile(mainFile)
      .then((content) => {
        if (!cancelled) setFileContent(mainFile, content)
      })
      .catch((err) => {
        console.log('Failed to read main file for kernel sync', err)
      })
    return () => {
      cancelled = true
    }
  }, [fsStatus, mainFile, readFile, setFileContent])

  // External changes: re-read from disk when the main file changes externally.
  //
  // If the file is open in the editor with unsaved edits, skip the disk read —
  // useKernelFiles already holds the live editor content and the editor will
  // show a conflict popup asking the user what to do.  When the user accepts
  // the external version Monaco calls model.setValue → onContentChange fires →
  // useKernelFiles is updated automatically.
  useEffect(() => {
    return onWatch((event) => {
      if (event.type !== 'change') return
      const path = event.path
      if (path !== mainFileRef.current) return

      const isOpenWithDirtyEdits =
        openTabsRef.current.includes(path) && dirtyTabsRef.current.has(path)

      if (isOpenWithDirtyEdits) return

      readFileRef
        .current(path)
        .then((content) => setFileContentRef.current(path, content))
        .catch(() => {})
    })
  }, [onWatch])

  return null
}
