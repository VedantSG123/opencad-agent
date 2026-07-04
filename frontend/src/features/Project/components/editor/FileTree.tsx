import {
  Crown,
  File,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { TreeRenderItemParams } from '@/components/tree-view'
import { type TreeDataItem, TreeView } from '@/components/tree-view'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn, toFsPath } from '@/lib/utils'

import { usePanelContext } from '../../context/PanelContext'
import { useEditor } from './context'

function getParentDirectory(filePath: string | null): string {
  if (!filePath) return '/'
  const lastSlash = filePath.lastIndexOf('/')
  if (lastSlash <= 0) return '/'
  return filePath.substring(0, lastSlash)
}

function insertPlaceholder(
  items: TreeDataItem[],
  parentId: string,
  type: 'file' | 'folder',
): TreeDataItem[] {
  if (parentId === '/') {
    const newItem: TreeDataItem = {
      id: 'new-item-placeholder',
      name: '',
      icon: type === 'file' ? File : Folder,
      openIcon: type === 'folder' ? FolderOpen : undefined,
    }
    return [newItem, ...items]
  }

  return items.map((item) => {
    if (item.id === parentId) {
      const newItem: TreeDataItem = {
        id: 'new-item-placeholder',
        name: '',
        icon: type === 'file' ? File : Folder,
        openIcon: type === 'folder' ? FolderOpen : undefined,
      }
      return {
        ...item,
        children: [newItem, ...(item.children || [])],
      }
    } else if (item.children) {
      return {
        ...item,
        children: insertPlaceholder(item.children, parentId, type),
      }
    }
    return item
  })
}

function useMainFileRenderItem(
  mainFileVirtualPath: string | null,
  onCommit: (name: string) => void,
  onCancel: () => void,
  onContextMenu: (
    e: React.MouseEvent,
    targetId: string,
    isFolder: boolean,
  ) => void,
) {
  return useCallback(
    ({ item, isLeaf, isOpen }: TreeRenderItemParams) => {
      if (item.id === 'new-item-placeholder') {
        const Icon = item.icon ?? null
        return (
          <div
            className='flex items-center w-full min-w-0 pr-2'
            onClick={(e) => e.stopPropagation()}
          >
            {Icon && (
              <Icon className='h-4 w-4 shrink-0 mr-2 text-muted-foreground' />
            )}
            <input
              autoFocus
              className='text-sm bg-background border border-primary px-1 py-0.5 rounded outline-none w-full min-w-0 h-6'
              defaultValue=''
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const target = e.currentTarget
                  if (target.dataset.processed) return
                  target.dataset.processed = 'true'

                  const val = target.value.trim()
                  if (val) {
                    onCommit(val)
                  } else {
                    onCancel()
                  }
                } else if (e.key === 'Escape') {
                  const target = e.currentTarget
                  if (target.dataset.processed) return
                  target.dataset.processed = 'true'
                  onCancel()
                }
              }}
              onBlur={(e) => {
                const target = e.currentTarget
                if (target.dataset.processed) return
                target.dataset.processed = 'true'

                const val = target.value.trim()
                if (val) {
                  onCommit(val)
                } else {
                  onCancel()
                }
              }}
            />
          </div>
        )
      }

      const Icon = isLeaf
        ? (item.icon ?? null)
        : ((isOpen ? item.openIcon : null) ?? item.icon ?? null)

      const isMain = isLeaf && item.id === mainFileVirtualPath

      return (
        <div
          className='flex items-center justify-between w-full min-w-0 pr-2 group/item'
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onContextMenu(e, item.id, !isLeaf)
          }}
        >
          <div className='flex items-center min-w-0'>
            {Icon && (
              <Icon className='h-4 w-4 shrink-0 mr-2 text-muted-foreground' />
            )}
            {isMain && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Crown className='h-3 w-3 shrink-0 mr-1.5 text-amber-400' />
                </TooltipTrigger>
                <TooltipContent>Main entry file</TooltipContent>
              </Tooltip>
            )}
            <span className={cn('text-sm truncate', isLeaf && 'grow')}>
              {item.name}
            </span>
          </div>
        </div>
      )
    },
    [mainFileVirtualPath, onCommit, onCancel, onContextMenu],
  )
}

export function FileTree() {
  const { isFocusMode, focusedPanel } = usePanelContext()

  const {
    project,
    sidebarOpen,
    treeData: rawTreeData,
    fsStatus,
    fsError,
    openFile,
    activeTab,
    createFile,
    createDirectory,
    deleteFile,
  } = useEditor()

  const [creatingItem, setCreatingItem] = useState<{
    parentId: string
    type: 'file' | 'folder'
  } | null>(null)

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    targetId: string
    isFolder: boolean
  } | null>(null)

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, targetId: string, isFolder: boolean) => {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        targetId,
        isFolder,
      })
    },
    [],
  )

  useEffect(() => {
    const handleClose = () => setContextMenu(null)
    window.addEventListener('click', handleClose)
    window.addEventListener('contextmenu', handleClose)
    return () => {
      window.removeEventListener('click', handleClose)
      window.removeEventListener('contextmenu', handleClose)
    }
  }, [])

  const handleCancel = useCallback(() => {
    setCreatingItem(null)
  }, [])

  const handleCommit = useCallback(
    async (name: string) => {
      if (!creatingItem) {
        setCreatingItem(null)
        return
      }

      const parentDir = creatingItem.parentId
      const path = parentDir === '/' ? `/${name}` : `${parentDir}/${name}`

      try {
        if (creatingItem.type === 'file') {
          await createFile(path, '')
          toast.success(`Created file ${name}`)
        } else {
          await createDirectory(path)
          toast.success(`Created folder ${name}`)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        toast.error(`Failed to create item: ${msg}`)
      } finally {
        setCreatingItem(null)
      }
    },
    [creatingItem, createFile, createDirectory],
  )

  const handleDelete = useCallback(
    async (path: string) => {
      const fileName = path.split('/').pop() ?? 'item'
      const confirmed = window.confirm(
        `Are you sure you want to delete "${fileName}"? This action cannot be undone.`,
      )
      if (!confirmed) return

      try {
        await deleteFile(path)
        toast.success(`Deleted "${fileName}"`)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        toast.error(`Failed to delete: ${msg}`)
      }
    },
    [deleteFile],
  )

  const startCreation = useCallback(
    (type: 'file' | 'folder', parentId?: string) => {
      const resolvedParentId = parentId ?? getParentDirectory(activeTab)
      setCreatingItem({ parentId: resolvedParentId, type })
    },
    [activeTab],
  )

  const treeData = useMemo(() => {
    let processed = rawTreeData
    if (creatingItem) {
      processed = insertPlaceholder(
        processed,
        creatingItem.parentId,
        creatingItem.type,
      )
    }
    return processed
  }, [rawTreeData, creatingItem])

  const mainFileVirtualPath =
    project?.file && project.directory
      ? toFsPath(project.directory, project.file)
      : null

  const isMainFile = contextMenu?.targetId === mainFileVirtualPath

  const renderItem = useMainFileRenderItem(
    mainFileVirtualPath,
    handleCommit,
    handleCancel,
    handleContextMenu,
  )

  const isTransparent = isFocusMode && focusedPanel === 'editor'

  return (
    <div
      className={cn(
        'flex flex-col border-r overflow-hidden transition-all duration-200 shrink-0 relative',
        sidebarOpen ? 'w-52' : 'w-0',
        isTransparent && 'bg-background/80',
      )}
    >
      <div className='w-52 flex flex-col h-full overflow-hidden'>
        <div className='px-3 py-2 flex items-center justify-between shrink-0 border-b border-muted'>
          <p className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>
            Files
          </p>
          <div className='flex items-center gap-1.5'>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => startCreation('file')}
                  className='p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer'
                  aria-label='New File'
                >
                  <FilePlus className='h-3.5 w-3.5' />
                </button>
              </TooltipTrigger>
              <TooltipContent>New File</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => startCreation('folder')}
                  className='p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer'
                  aria-label='New Folder'
                >
                  <FolderPlus className='h-3.5 w-3.5' />
                </button>
              </TooltipTrigger>
              <TooltipContent>New Folder</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className='flex-1 overflow-auto'>
          {fsStatus === 'ready' ? (
            <TreeView
              data={treeData}
              onSelectChange={(item) => item && openFile(item)}
              renderItem={renderItem}
            />
          ) : fsStatus === 'connecting' ? (
            <p className='px-3 py-2 text-xs text-muted-foreground'>
              Connecting…
            </p>
          ) : (
            <p className='px-3 py-2 text-xs text-destructive'>
              {fsError ?? 'Connection closed'}
            </p>
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          className='fixed z-50 min-w-[140px] overflow-hidden rounded-lg border border-muted bg-popover/80 backdrop-blur-md p-1 text-popover-foreground shadow-md animate-in fade-in-80 slide-in-from-top-1 duration-100'
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.isFolder && (
            <>
              <button
                onClick={() => {
                  setContextMenu(null)
                  startCreation('file', contextMenu.targetId)
                }}
                className='relative flex w-full select-none items-center rounded-md px-2.5 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer gap-2'
              >
                <FilePlus className='h-3.5 w-3.5 text-muted-foreground' />
                <span>New File</span>
              </button>
              <button
                onClick={() => {
                  setContextMenu(null)
                  startCreation('folder', contextMenu.targetId)
                }}
                className='relative flex w-full select-none items-center rounded-md px-2.5 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer gap-2'
              >
                <FolderPlus className='h-3.5 w-3.5 text-muted-foreground' />
                <span>New Folder</span>
              </button>
              <div className='my-1 h-px bg-muted' />
            </>
          )}
          <button
            onClick={() => {
              if (isMainFile) return
              setContextMenu(null)
              void handleDelete(contextMenu.targetId)
            }}
            disabled={isMainFile}
            className={cn(
              'relative flex w-full select-none items-center rounded-md px-2.5 py-1.5 text-xs outline-none transition-colors gap-2 font-medium',
              isMainFile
                ? 'text-muted-foreground opacity-50 cursor-not-allowed'
                : 'text-destructive hover:bg-destructive/15 cursor-pointer',
            )}
          >
            <Trash2 className='h-3.5 w-3.5' />
            <span>Delete {contextMenu.isFolder ? 'Folder' : 'File'}</span>
          </button>
        </div>
      )}
    </div>
  )
}
