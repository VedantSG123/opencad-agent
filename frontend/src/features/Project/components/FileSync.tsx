import { useEffect, useRef } from 'react'

import { useKernelFiles } from '@/hooks/useKernelFiles'

import { useEditor } from './editor/context'

export function FileSync() {
  const { readFile, onWatch, dirtyTabs } = useEditor()
  const setFileContent = useKernelFiles((state) => state.setFileContent)

  const readFileRef = useRef(readFile)
  const setFileContentRef = useRef(setFileContent)
  const dirtyTabsRef = useRef(dirtyTabs)

  useEffect(() => {
    readFileRef.current = readFile
  }, [readFile])
  useEffect(() => {
    setFileContentRef.current = setFileContent
  }, [setFileContent])
  useEffect(() => {
    dirtyTabsRef.current = dirtyTabs
  }, [dirtyTabs])

  useEffect(() => {
    return onWatch((event) => {
      if (event.type !== 'change') return

      const path = event.path
      if (dirtyTabsRef.current.has(path)) return

      readFileRef
        .current(path)
        .then((content) => setFileContentRef.current(path, content))
        .catch(() => {})
    })
  }, [onWatch])

  return null
}
