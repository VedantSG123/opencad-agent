import {
  File,
  Folder,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { TreeDataItem } from '@/components/tree-view'
import { TreeView } from '@/components/tree-view'
import { Button } from '@/components/ui/button'
import type { FSEntry, WatchEvent } from '@/hooks/useFileSyncWS'
import { useFileSyncWS } from '@/hooks/useFileSyncWS'
import { cn } from '@/lib/utils'

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

function fileName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

interface CodeEditorPanelProps {
  projectId: string
}

export function CodeEditorPanel({ projectId }: CodeEditorPanelProps) {
  const fsync = useFileSyncWS(projectId)
  const { status, readFile, readdirWithTypes, onWatch } = fsync

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [treeVersion, setTreeVersion] = useState(0)
  const [treeData, setTreeData] = useState<TreeDataItem[]>([])
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileVersion, setFileVersion] = useState(0)
  const [loadedInfo, setLoadedInfo] = useState<{
    tab: string | null
    version: number
  }>({
    tab: null,
    version: 0,
  })

  // isLoadingContent is derived — no synchronous setState needed
  const isLoadingContent =
    activeTab !== null &&
    (loadedInfo.tab !== activeTab || loadedInfo.version !== fileVersion)

  // Ref to read activeTab inside the watch callback without adding it to deps
  const activeTabRef = useRef(activeTab)
  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  // Tree loading — setState only in async .then(), never synchronously in body
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

  // Watch handler — all setState calls are inside the external callback, not in the effect body
  useEffect(() => {
    return onWatch((event: WatchEvent) => {
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
  }, [onWatch])

  // File content loading — setState only in async callbacks, never synchronously in body
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

  const openFile = useCallback((item: TreeDataItem) => {
    if (item.children !== undefined) return
    const path = item.id
    setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]))
    setActiveTab(path)
  }, [])

  const closeTab = useCallback((path: string, e: React.MouseEvent) => {
    e.stopPropagation()
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

  return (
    <div className='h-full flex flex-col bg-card overflow-hidden'>
      {/* Ribbon / Tab Bar */}
      <div className='flex items-center gap-1 border-b px-1 h-10 shrink-0'>
        <Button
          variant='ghost'
          size='icon'
          className='h-7 w-7 shrink-0'
          onClick={() => setSidebarOpen((v) => !v)}
        >
          {sidebarOpen ? (
            <PanelLeftClose className='h-4 w-4' />
          ) : (
            <PanelLeftOpen className='h-4 w-4' />
          )}
        </Button>

        <div className='w-px h-5 bg-border mx-1 shrink-0' />

        <div className='flex items-center gap-0.5 overflow-x-auto flex-1 scrollbar-none'>
          {openTabs.map((path) => (
            <button
              key={path}
              onClick={() => setActiveTab(path)}
              className={cn(
                'flex items-center gap-1.5 px-3 h-7 text-xs rounded-md shrink-0 max-w-[160px] group transition-colors',
                activeTab === path
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <span className='truncate'>{fileName(path)}</span>
              <span
                role='button'
                onClick={(e) => closeTab(path, e)}
                className='h-3.5 w-3.5 shrink-0 rounded-sm flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity'
              >
                <X className='h-2.5 w-2.5' />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className='flex flex-1 overflow-hidden'>
        {/* Sidebar */}
        <div
          className={cn(
            'flex flex-col border-r overflow-hidden transition-all duration-200 shrink-0',
            sidebarOpen ? 'w-52' : 'w-0',
          )}
        >
          <div className='w-52 flex flex-col h-full overflow-hidden'>
            <p className='px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0'>
              Files
            </p>
            <div className='flex-1 overflow-auto'>
              {status === 'ready' ? (
                <TreeView
                  data={treeData}
                  onSelectChange={(item) => item && openFile(item)}
                  defaultLeafIcon={File}
                  defaultNodeIcon={Folder}
                />
              ) : status === 'connecting' ? (
                <p className='px-3 py-2 text-xs text-muted-foreground'>
                  Connecting…
                </p>
              ) : (
                <p className='px-3 py-2 text-xs text-destructive'>
                  {fsync.error ?? 'Connection closed'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className='flex-1 overflow-auto bg-background'>
          {!activeTab ? (
            <div className='h-full flex items-center justify-center'>
              <span className='text-sm text-muted-foreground'>
                Open a file from the sidebar
              </span>
            </div>
          ) : isLoadingContent ? (
            <div className='h-full flex items-center justify-center'>
              <span className='text-sm text-muted-foreground'>Loading…</span>
            </div>
          ) : fileContent === null ? (
            <div className='h-full flex items-center justify-center'>
              <span className='text-sm text-destructive'>
                Failed to load file
              </span>
            </div>
          ) : (
            <pre className='p-4 text-xs font-mono whitespace-pre text-foreground leading-relaxed'>
              {fileContent}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
