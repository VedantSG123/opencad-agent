import { LayoutAlignLeftIcon, LayoutLeftIcon } from '@hugeicons/core-free-icons'
import { useState } from 'react'
import { Outlet } from 'react-router'

import { TitlebarIconButton } from '@/components/custom/TitlebarIconButton'
import { Icon } from '@/components/icons/HugeIcon'
import { usePlatform } from '@/hooks/usePlatform'
import { cn } from '@/lib/utils'

import { AppSidebar } from './components/AppSidebar'
import { SettingsDialog } from './components/SettingsDialog'

export { DashboardView } from './components/DashboardView'
export { ProjectsView } from './components/ProjectsView'

export function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { isElectron, isMac } = usePlatform()

  return (
    <div className='flex flex-col h-screen w-full overflow-hidden'>
      <header
        className={cn(
          'h-9 shrink-0 flex items-center px-4 select-none',
          isElectron ? 'electron-drag' : '',
        )}
      >
        <div
          className={cn(
            'h-full flex items-center electron-no-drag',
            isMac ? 'pl-20' : '',
          )}
        >
          <TitlebarIconButton
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className='-ml-2 mt-0.5'
          >
            <Icon icon={sidebarOpen ? LayoutAlignLeftIcon : LayoutLeftIcon} />
          </TitlebarIconButton>
        </div>
      </header>

      <div className='flex-1 flex min-w-0 overflow-hidden'>
        <AppSidebar
          onSettingsClick={() => setSettingsOpen(true)}
          isOpen={sidebarOpen}
        />
        <main className='flex-1 flex flex-col overflow-hidden'>
          <div className='flex-1 flex flex-col overflow-auto shadow bg-background rounded-tl-xl border-t border-l dark:border-border/60'>
            <Outlet />
          </div>
        </main>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

export default Dashboard
