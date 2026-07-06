import { isBinary } from 'istextorbinary'
import { File, Folder, FolderOpen } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'

import type { TreeDataItem } from '@/components/tree-view'
import {
  type FileSyncStatus,
  type FSEntry,
  FSNotReadyError,
  type WatchEvent,
} from '@/hooks/useFileSyncWS'
import { useFileSyncWS } from '@/hooks/useFileSyncWS'
import { toFsPath } from '@/lib/utils'
import type { Project } from '@/types/project'

import type { DialogState, EditorDialogs } from './useEditorDialogs'
import { useEditorDialogs } from './useEditorDialogs'

export type { DialogState }

// ─── Tree helpers (pure functions, no reactivity) ──────────────────────────

function addItemToTree(
  items: TreeDataItem[],
  parentPath: string,
  newItem: TreeDataItem,
): TreeDataItem[] {
  if (parentPath === '/') {
    return [...items, newItem].sort(sortTreeItems)
  }
  return items.map((item) => {
    if (item.id === parentPath) {
      return {
        ...item,
        children: [...(item.children || []), newItem].sort(sortTreeItems),
      }
    }
    if (item.children) {
      return {
        ...item,
        children: addItemToTree(item.children, parentPath, newItem),
      }
    }
    return item
  })
}

function removeItemFromTree(
  items: TreeDataItem[],
  targetPath: string,
): TreeDataItem[] {
  return items
    .filter((item) => item.id !== targetPath)
    .map((item) => {
      if (item.children) {
        return {
          ...item,
          children: removeItemFromTree(item.children, targetPath),
        }
      }
      return item
    })
}

function renameItemInTree(
  items: TreeDataItem[],
  oldPath: string,
  newPath: string,
): TreeDataItem[] {
  return items.map((item) => {
    if (item.id === oldPath) {
      const newName = newPath.split('/').pop() ?? item.name
      return { ...item, id: newPath, name: newName }
    }
    if (item.children) {
      return {
        ...item,
        children: renameItemInTree(item.children, oldPath, newPath),
      }
    }
    return item
  })
}

function itemExistsInTree(items: TreeDataItem[], targetPath: string): boolean {
  for (const item of items) {
    if (item.id === targetPath) return true
    if (item.children && itemExistsInTree(item.children, targetPath))
      return true
  }
  return false
}

function sortTreeItems(a: TreeDataItem, b: TreeDataItem): number {
  const aIsDir = !!a.children
  const bIsDir = !!b.children
  if (aIsDir !== bIsDir) return aIsDir ? -1 : 1
  return a.name.localeCompare(b.name)
}

// ─── Utility ────────────────────────────────────────────────────────────────

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

  return items.sort(sortTreeItems)
}

function findFileInTree(items: TreeDataItem[], targetPath: string): boolean {
  for (const item of items) {
    if (item.children) {
      if (findFileInTree(item.children, targetPath)) return true
    } else if (item.id === targetPath) {
      return true
    }
  }
  return false
}

function findFirstFile(items: TreeDataItem[]): string | null {
  for (const item of items) {
    if (item.children) {
      const found = findFirstFile(item.children)
      if (found) return found
    } else {
      return item.id
    }
  }
  return null
}

function isDescendantPath(ancestor: string, child: string): boolean {
  return child === ancestor || child.startsWith(ancestor + '/')
}

/** Imperative API that MonacoEditor registers so the context can read/write models. */
export interface EditorAPI {
  getContent: (path: string) => string | null
  applyContent: (path: string, content: string) => void
}

interface EditorContextValue extends EditorDialogs {
  // Project
  project: Project
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
  isBinaryFile: boolean
  isLoadingContent: boolean
  saveFile: (path: string, content: string) => Promise<void>
  createFile: (path: string, content?: string) => Promise<void>
  createDirectory: (path: string) => Promise<void>
  deleteFile: (path: string) => Promise<void>
  renameFile: (oldPath: string, newPath: string) => Promise<void>
  // Dirty tracking
  dirtyTabs: Set<string>
  setTabDirty: (path: string, dirty: boolean) => void
  // MonacoEditor registration
  registerEditorAPI: (api: EditorAPI) => void
  // FS primitives (for kernel sync and other consumers outside the editor)
  readFile: (path: string) => Promise<string>
  onWatch: (handler: (event: WatchEvent) => void) => () => void
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
  project: Project
  children: React.ReactNode
}

export function EditorProvider({ project, children }: EditorProviderProps) {
  const fsync = useFileSyncWS(project.id, project.directory)
  const { status, readFile, writeFile, mkdir, readdirWithTypes, onWatch } =
    fsync

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [treeVersion, setTreeVersion] = useState(0)
  const [treeData, setTreeData] = useState<TreeDataItem[]>([])
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [isBinaryFile, setIsBinaryFile] = useState<boolean>(false)
  const [fileVersion, setFileVersion] = useState(0)
  const [loadedInfo, setLoadedInfo] = useState<{
    tab: string | null
    version: number
  }>({ tab: null, version: 0 })
  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(new Set())

  const hasOpenedDefaultRef = useRef(false)

  useEffect(() => {
    hasOpenedDefaultRef.current = false
  }, [project.id])

  useEffect(() => {
    if (
      status === 'ready' &&
      treeData.length > 0 &&
      !hasOpenedDefaultRef.current
    ) {
      hasOpenedDefaultRef.current = true
      const mainFileVirtualPath =
        project.file && project.directory
          ? (toFsPath(project.directory, project.file) ??
            `/main${project.cad_kernel === 'replicad' ? '.js' : '.scad'}`)
          : `/main${project.cad_kernel === 'replicad' ? '.js' : '.scad'}`

      const exists = findFileInTree(treeData, mainFileVirtualPath)
      if (exists) {
        setOpenTabs([mainFileVirtualPath])

        setActiveTab(mainFileVirtualPath)
      } else {
        const firstFile = findFirstFile(treeData)
        if (firstFile) {
          setOpenTabs([firstFile])

          setActiveTab(firstFile)
        }
      }
    }
  }, [status, treeData, project])

  const isLoadingContent =
    activeTab !== null &&
    (loadedInfo.tab !== activeTab || loadedInfo.version !== fileVersion)

  // Refs used inside stable callbacks to avoid stale closures
  const activeTabRef = useRef(activeTab)
  const dirtyTabsRef = useRef(dirtyTabs)
  const editorAPIRef = useRef<EditorAPI | null>(null)
  const treeDataRef = useRef(treeData)

  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  useEffect(() => {
    dirtyTabsRef.current = dirtyTabs
  }, [dirtyTabs])

  useEffect(() => {
    treeDataRef.current = treeData
  }, [treeData])

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
    setIsBinaryFile(false)
    readFile(activeTab)
      .then((content) => {
        if (cancelled) return

        const buffer = new TextEncoder().encode(content.slice(0, 8192))
        const binary = isBinary(activeTab, buffer)

        setIsBinaryFile(binary)
        setFileContent(binary ? null : content)
        setLoadedInfo({ tab: activeTab, version: currentVersion })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof FSNotReadyError) return
        toast.error('Failed to read file from remote FS')
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

  /** Prompt user about dirty tabs that would be affected by an operation. */
  const confirmAffectsDirty = useCallback(
    (path: string, isDirectory: boolean): boolean => {
      const dirty = dirtyTabsRef.current
      const affectedPaths: string[] = []
      for (const tabPath of dirty) {
        if (
          tabPath === path ||
          (isDirectory && tabPath.startsWith(path + '/'))
        ) {
          affectedPaths.push(tabPath)
        }
      }
      if (affectedPaths.length === 0) return true

      const names = affectedPaths.map((p) => p.split('/').pop()).join(', ')
      return window.confirm(
        `"${path.split('/').pop()}" has unsaved changes in ${affectedPaths.length} open tab(s) (${names}). Discard changes and continue? Click Cancel to skip.`,
      )
    },
    [],
  )

  const createFile = useCallback(
    async (path: string, content = '') => {
      const parentPath = path.includes('/')
        ? path.substring(0, path.lastIndexOf('/'))
        : '/'
      const name = path.split('/').pop() ?? ''

      if (itemExistsInTree(treeDataRef.current, path)) {
        toast.error(`"${name}" already exists`)
        return
      }

      const item: TreeDataItem = { id: path, name, icon: File }
      setTreeData((prev) => addItemToTree(prev, parentPath, item))

      try {
        await writeFile(path, content)
        // Open the new file in the editor
        setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]))
        setActiveTab(path)
      } catch (err: unknown) {
        // Rollback optimistic update
        setTreeData((prev) => removeItemFromTree(prev, path))
        const msg = err instanceof Error ? err.message : 'Unknown error'
        toast.error(`Failed to create file "${name}": ${msg}`)
        throw err
      }
    },
    [writeFile],
  )

  const createDirectory = useCallback(
    async (path: string) => {
      const parentPath = path.includes('/')
        ? path.substring(0, path.lastIndexOf('/'))
        : '/'
      const name = path.split('/').pop() ?? ''

      if (itemExistsInTree(treeDataRef.current, path)) {
        toast.error(`Folder "${name}" already exists`)
        return
      }

      const item: TreeDataItem = {
        id: path,
        name,
        icon: Folder,
        openIcon: FolderOpen,
        children: [],
      }
      setTreeData((prev) => addItemToTree(prev, parentPath, item))

      try {
        await mkdir(path)
      } catch (err: unknown) {
        setTreeData((prev) => removeItemFromTree(prev, path))
        const msg = err instanceof Error ? err.message : 'Unknown error'
        toast.error(`Failed to create folder "${name}": ${msg}`)
        throw err
      }
    },
    [mkdir],
  )

  function isDirPath(path: string): boolean {
    return treeDataRef.current.some(function check(item): boolean {
      if (item.id === path) return !!item.children
      if (item.children) return item.children.some(check)
      return false
    })
  }

  const deleteFile = useCallback(
    async (path: string) => {
      const name = path.split('/').pop() ?? 'item'
      const isDir = isDirPath(path)

      // Check dirty tabs
      const canProceed = confirmAffectsDirty(path, isDir)
      if (!canProceed) return

      // Optimistic: remove from tree and close tabs
      const prevTree = treeDataRef.current
      setTreeData((prev) => removeItemFromTree(prev, path))
      setOpenTabs((prev) => {
        const next = prev.filter((t) => !isDescendantPath(path, t))
        setActiveTab((current) => {
          if (current && isDescendantPath(path, current)) {
            return next[next.length - 1] ?? null
          }
          return current
        })
        return next
      })

      try {
        await fsync.deleteFile(path)
      } catch (err: unknown) {
        setTreeData(prevTree)
        setTreeVersion((v) => v + 1)
        const msg = err instanceof Error ? err.message : 'Unknown error'
        toast.error(`Failed to delete "${name}": ${msg}`)
        throw err
      }
    },
    [fsync, confirmAffectsDirty],
  )

  const renameFile = useCallback(
    async (oldPath: string, newPath: string) => {
      const name = newPath.split('/').pop() ?? 'item'

      // Check for collisions
      if (itemExistsInTree(treeDataRef.current, newPath)) {
        toast.error(`"${name}" already exists`)
        return
      }

      // Check dirty tabs
      const canProceed = confirmAffectsDirty(oldPath, false)
      if (!canProceed) return

      // Save editor buffer content before rename
      const editorContent = editorAPIRef.current?.getContent(oldPath)

      // Optimistic: update tree and remap tabs
      const prevTree = treeDataRef.current
      setTreeData((prev) => renameItemInTree(prev, oldPath, newPath))
      setOpenTabs((prev) => {
        const next = prev.map((t) => {
          if (t === oldPath) return newPath
          if (t.startsWith(oldPath + '/')) {
            return newPath + t.substring(oldPath.length)
          }
          return t
        })
        setActiveTab((current) => {
          if (current === oldPath) return newPath
          if (current && current.startsWith(oldPath + '/')) {
            return newPath + current.substring(oldPath.length)
          }
          return current
        })
        return next
      })

      try {
        await fsync.rename(oldPath, newPath)
        // Transfer content from old editor buffer to new path
        if (editorContent !== null && editorContent !== undefined) {
          editorAPIRef.current?.applyContent(newPath, editorContent)
        }
        // Mark the dirty flag for the new path
        if (dirtyTabsRef.current.has(oldPath)) {
          setTabDirty(oldPath, false)
          setTabDirty(newPath, true)
        }
      } catch (err: unknown) {
        // Rollback
        setTreeData(prevTree)
        setTreeVersion((v) => v + 1)
        setOpenTabs((prev) => {
          const rolledBack = prev.map((t) => {
            if (t === newPath) return oldPath
            if (t.startsWith(newPath + '/')) {
              return oldPath + t.substring(newPath.length)
            }
            return t
          })
          setActiveTab((current) => {
            if (current === newPath) return oldPath
            if (current && current.startsWith(newPath + '/')) {
              return oldPath + current.substring(newPath.length)
            }
            return current
          })
          return rolledBack
        })
        const msg = err instanceof Error ? err.message : 'Unknown error'
        toast.error(`Failed to rename: ${msg}`)
        throw err
      }
    },
    [fsync, confirmAffectsDirty, setTabDirty],
  )

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
        project,
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
        isBinaryFile,
        isLoadingContent,
        saveFile: writeFile,
        createFile,
        createDirectory,
        deleteFile,
        renameFile,
        dirtyTabs,
        setTabDirty,
        registerEditorAPI,
        readFile,
        onWatch,
        ...dialogs,
      }}
    >
      {children}
    </EditorContext.Provider>
  )
}
