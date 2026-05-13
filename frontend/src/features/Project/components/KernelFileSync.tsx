import { useEffect, useRef } from 'react'

import { useKernelFiles } from '@/hooks/useKernelFiles'
import { toFsPath } from '@/lib/utils'

import { useEditor } from './editor/context'

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
