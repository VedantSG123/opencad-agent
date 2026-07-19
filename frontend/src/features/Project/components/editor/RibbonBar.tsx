import {
  Alert02Icon,
  ArrowDataTransferHorizontalIcon,
  BoxIcon,
  Crown02Icon,
  LayoutAlignLeftIcon,
  LayoutLeftIcon,
  TerminalIcon,
} from '@hugeicons/core-free-icons'
import { useState } from 'react'

import { TitlebarIconButton } from '@/components/custom/TitlebarIconButton'
import { Icon } from '@/components/icons/HugeIcon'
import { XIcon } from '@/components/icons/XIcon'
import { usePanelContext } from '@/features/Project/context/PanelContext'
import { cn, toFsPath } from '@/lib/utils'

import { useEditor } from './context'
import { SetMainFileDialog } from './SetMainFileDialog'

function fileName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

export function RibbonBar() {
  const {
    project,
    sidebarOpen,
    setSidebarOpen,
    openTabs,
    activeTab,
    setActiveTab,
    requestCloseTab,
    dirtyTabs,
  } = useEditor()
  const { isFocusMode, setFocusedPanel, toggleConsole, isConsoleCollapsed } =
    usePanelContext()
  const [mainFileDialogOpen, setMainFileDialogOpen] = useState(false)

  const missingMainFile = project !== undefined && project.file === null

  const mainFileVirtualPath =
    project?.file && project.directory
      ? toFsPath(project.directory, project.file)
      : null

  return (
    <div className='flex items-center gap-1 border-b border-border px-1 h-10 shrink-0'>
      <TitlebarIconButton
        onPress={() => setSidebarOpen((v) => !v)}
        aria-label={sidebarOpen ? 'Hide file sidebar' : 'Show file sidebar'}
      >
        <Icon
          icon={sidebarOpen ? LayoutAlignLeftIcon : LayoutLeftIcon}
          size={16}
        />
      </TitlebarIconButton>

      <div className='w-px h-5 bg-border mx-1 shrink-0' />

      {missingMainFile && (
        <button
          onClick={() => setMainFileDialogOpen(true)}
          className='flex items-center gap-1 px-2 h-7 text-xs rounded-md shrink-0 text-amber-500 hover:bg-amber-500/10 transition-colors'
        >
          <Icon icon={Alert02Icon} size={14} />
          No main file
        </button>
      )}

      <div className='flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0 scrollbar-none'>
        {openTabs.map((path) => {
          const isDirty = dirtyTabs.has(path)
          const isMain = path === mainFileVirtualPath
          return (
            <button
              key={path}
              onClick={() => setActiveTab(path)}
              className={cn(
                'flex items-center gap-1.5 px-2 h-7 text-xs rounded-md shrink-0 max-w-40 group transition-colors',
                activeTab === path
                  ? 'bg-muted/10 text-foreground'
                  : 'text-foreground/60 hover:bg-muted/15 hover:text-foreground',
              )}
            >
              {isMain && (
                <Icon
                  icon={Crown02Icon}
                  size={12}
                  className='shrink-0 text-amber-400'
                />
              )}
              <span className='truncate'>{fileName(path)}</span>
              {/* Close/dirty indicator — same slot, swap on hover */}
              <span className='relative h-3.5 w-3.5 shrink-0 flex items-center justify-center'>
                {isDirty && (
                  <span className='absolute h-1.5 w-1.5 rounded-full bg-current group-hover:opacity-0 transition-opacity' />
                )}
                <span
                  role='button'
                  onClick={(e) => requestCloseTab(path, e)}
                  className='absolute inset-0 rounded-sm flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted/25 transition-opacity'
                >
                  <XIcon size={10} />
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <TitlebarIconButton
        className={cn(!isConsoleCollapsed && 'text-foreground bg-muted/10')}
        onPress={toggleConsole}
        aria-label='Toggle execution console'
      >
        <Icon icon={TerminalIcon} size={16} />
      </TitlebarIconButton>

      {isFocusMode && (
        <button
          onClick={() => setFocusedPanel('viewport')}
          className='flex items-center gap-2 px-2 h-7 text-xs rounded-md shrink-0 text-foreground/60 group hover:text-foreground hover:bg-muted/15 transition-colors'
        >
          <Icon
            icon={ArrowDataTransferHorizontalIcon}
            size={16}
            className='group-hover:text-blue-500'
          />
          <div className='flex items-center gap-1'>
            <Icon icon={BoxIcon} size={14} />
            <span>3D Viewport</span>
          </div>
        </button>
      )}

      <SetMainFileDialog
        open={mainFileDialogOpen}
        onClose={() => setMainFileDialogOpen(false)}
      />
    </div>
  )
}
