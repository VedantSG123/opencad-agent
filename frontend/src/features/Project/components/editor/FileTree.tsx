import { Crown } from 'lucide-react'
import { useCallback } from 'react'

import type { TreeRenderItemParams } from '@/components/tree-view'
import { TreeView } from '@/components/tree-view'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { usePanelContext } from '../../context/PanelContext'
import { useEditor } from './context'

function useMainFileRenderItem(mainFileVirtualPath: string | null) {
  return useCallback(
    ({ item, isLeaf, isOpen }: TreeRenderItemParams) => {
      const Icon = isLeaf
        ? (item.icon ?? null)
        : ((isOpen ? item.openIcon : null) ?? item.icon ?? null)

      const isMain = isLeaf && item.id === mainFileVirtualPath

      return (
        <>
          {Icon && <Icon className='h-4 w-4 shrink-0 mr-2' />}
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
        </>
      )
    },
    [mainFileVirtualPath],
  )
}

export function FileTree() {
  const { isFocusMode, focusedPanel } = usePanelContext()

  const { project, sidebarOpen, treeData, fsStatus, fsError, openFile } =
    useEditor()

  const mainFileVirtualPath =
    project?.file && project.directory
      ? project.file.slice(project.directory.length)
      : null

  const renderItem = useMainFileRenderItem(mainFileVirtualPath)

  const isTransparent = isFocusMode && focusedPanel === 'editor'

  return (
    <div
      className={cn(
        'flex flex-col border-r overflow-hidden transition-all duration-200 shrink-0',
        sidebarOpen ? 'w-52' : 'w-0',
        isTransparent && 'bg-background/80',
      )}
    >
      <div className='w-52 flex flex-col h-full overflow-hidden'>
        <p className='px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0'>
          Files
        </p>
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
    </div>
  )
}
