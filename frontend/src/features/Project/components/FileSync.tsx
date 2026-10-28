import { useEffect, useRef } from 'react'

import { kernelFilesStore } from '@/hooks/useKernelFiles'
import { createKernelFileSync } from '@/lib/kernelFileSync'

import { useEditor } from './editor/context'

export function FileSync() {
  const { readFile, onWatch, dirtyTabs } = useEditor()
  const readFileRef = useRef(readFile)
  const dirtyTabsRef = useRef(dirtyTabs)

  useEffect(() => {
    readFileRef.current = readFile
  }, [readFile])
  useEffect(() => {
    dirtyTabsRef.current = dirtyTabs
  }, [dirtyTabs])

  useEffect(() => {
    const sync = createKernelFileSync({
      readFile: (path) => readFileRef.current(path),
      isDirty: (path) => dirtyTabsRef.current.has(path),
    })
    const stopWatching = onWatch((event) => void sync.handle(event))
    return () => {
      stopWatching()
      sync.dispose()
      kernelFilesStore.getState().clearAll()
    }
  }, [onWatch])

  return null
}
