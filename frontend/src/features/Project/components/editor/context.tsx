import { File, Folder, FolderOpen } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

import type { TreeDataItem } from '@/components/tree-view'
import type { FileSyncStatus, FSEntry, WatchEvent } from '@/hooks/useFileSyncWS'
import { useFileSyncWS } from '@/hooks/useFileSyncWS'

import type { DialogState, EditorDialogs } from './useEditorDialogs'
import { useEditorDialogs } from './useEditorDialogs'

export type { DialogState }

// ─── Types

async function buildTree(
  readdirWithTypes: (path: string) => Promise<FSEntry[]>,
  path: string,
): Promise<TreeDataItem[]> {
  const entries = await readdirWithTypes(path)
  const items: TreeDataItem[] = []

  for (const entry of entries) {
    const entryPath = path === '/' ? `/${entry.name}` : `${path}/${entry.name}`
    if (entry.isDirectory()) {
      const children = await buildTree(readdirWithTypes, entryPath)
      items.push({
        id: entryPath,
        name: entry.name,
        icon: Folder,
        openIcon: FolderOpen,
        children,
      })
    } else {
      items.push({ id: entryPath, name: entry.name, icon: File })
    }
  }

  return items.sort((a, b) => {
    const aIsDir = !!a.children
    const bIsDir = !!b.children
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

/** Imperative API that MonacoEditor registers so the context can read/write models. */
export interface EditorAPI {
  getContent: (path: string) => string | null
  applyContent: (path: string, content: string) => void
}

interface EditorContextValue extends EditorDialogs {
  // Sidebar
  sidebarOpen: boolean
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>
  // File tree
  treeData: TreeDataItem[]
  fsStatus: FileSyncStatus
  fsError: string | null
  // Tabs
  openTabs: string[]
  activeTab: string | null
  setActiveTab: React.Dispatch<React.SetStateAction<string | null>>
  openFile: (item: TreeDataItem) => void
  // File content
  fileContent: string | null
  isLoadingContent: boolean
  saveFile: (path: string, content: string) => Promise<void>
  // Dirty tracking
  dirtyTabs: Set<string>
  setTabDirty: (path: string, dirty: boolean) => void
  // MonacoEditor registration
  registerEditorAPI: (api: EditorAPI) => void
}

// ─── Context ──────────────────────────────────────────────────────────────────

const EditorContext = createContext<EditorContextValue | null>(null)

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('useEditor must be used inside EditorProvider')
  return ctx
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface EditorProviderProps {
  projectId: string
  children: React.ReactNode
}

export function EditorProvider({ projectId, children }: EditorProviderProps) {
  const fsync = useFileSyncWS(projectId)
  const { status, readFile, writeFile, readdirWithTypes, onWatch } = fsync

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [treeVersion, setTreeVersion] = useState(0)
  const [treeData, setTreeData] = useState<TreeDataItem[]>([])
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileVersion, setFileVersion] = useState(0)
  const [loadedInfo, setLoadedInfo] = useState<{
    tab: string | null
    version: number
  }>({ tab: null, version: 0 })
  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(new Set())

  const isLoadingContent =
    activeTab !== null &&
    (loadedInfo.tab !== activeTab || loadedInfo.version !== fileVersion)

  // Refs used inside stable callbacks to avoid stale closures
  const activeTabRef = useRef(activeTab)
  const dirtyTabsRef = useRef(dirtyTabs)
  const editorAPIRef = useRef<EditorAPI | null>(null)

  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  useEffect(() => {
    dirtyTabsRef.current = dirtyTabs
  }, [dirtyTabs])

  // ── Tree loading ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (status !== 'ready') return
    let cancelled = false
    buildTree(readdirWithTypes, '/')
      .then((tree) => {
        if (!cancelled) setTreeData(tree)
      })
      .catch(console.error)
    return () => {
      cancelled = true
    }
  }, [status, readdirWithTypes, treeVersion])

  // ── Watch handler ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const cleanup = onWatch((event: WatchEvent) => {
      setTreeVersion((v) => v + 1)
      if (event.type === 'unlink') {
        setOpenTabs((prev) => {
          if (!prev.includes(event.path)) return prev
          const next = prev.filter((t) => t !== event.path)
          setActiveTab((current) =>
            current === event.path ? (next[next.length - 1] ?? null) : current,
          )
          return next
        })
      } else if (
        event.type === 'change' &&
        event.path === activeTabRef.current
      ) {
        setFileVersion((v) => v + 1)
      }
    })
    return cleanup
  }, [onWatch])

  // ── File content loading ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeTab || status !== 'ready') return
    const currentVersion = fileVersion
    let cancelled = false
    readFile(activeTab)
      .then((content) => {
        if (cancelled) return
        setFileContent(content)
        setLoadedInfo({ tab: activeTab, version: currentVersion })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('Failed to read file', err)
        setFileContent(null)
        setLoadedInfo({ tab: activeTab, version: currentVersion })
      })
    return () => {
      cancelled = true
    }
  }, [activeTab, status, readFile, fileVersion])

  // ── Stable callbacks ──────────────────────────────────────────────────────────

  const setTabDirty = useCallback((path: string, dirty: boolean) => {
    setDirtyTabs((prev) => {
      if (prev.has(path) === dirty) return prev
      const next = new Set(prev)
      if (dirty) next.add(path)
      else next.delete(path)
      return next
    })
  }, [])

  const performCloseTab = useCallback((path: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t !== path)
      setActiveTab((current) => {
        if (current !== path) return current
        const idx = prev.indexOf(path)
        return next[Math.min(idx, next.length - 1)] ?? null
      })
      return next
    })
  }, [])

  const openFile = useCallback((item: TreeDataItem) => {
    if (item.children !== undefined) return
    const path = item.id
    setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]))
    setActiveTab(path)
  }, [])

  const registerEditorAPI = useCallback((api: EditorAPI) => {
    editorAPIRef.current = api
  }, [])

  // ── Dialog management ─────────────────────────────────────────────────────────

  const dialogs = useEditorDialogs({
    dirtyTabsRef,
    editorAPIRef,
    performCloseTab,
    saveFile: writeFile,
    setTabDirty,
  })

  return (
    <EditorContext.Provider
      value={{
        sidebarOpen,
        setSidebarOpen,
        treeData,
        fsStatus: status,
        fsError: fsync.error,
        openTabs,
        activeTab,
        setActiveTab,
        openFile,
        fileContent,
        isLoadingContent,
        saveFile: writeFile,
        dirtyTabs,
        setTabDirty,
        registerEditorAPI,
        ...dialogs,
      }}
    >
      {children}
    </EditorContext.Provider>
  )
}
