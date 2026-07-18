import { PanelLeft } from 'lucide-react'
import { useState } from 'react'
import { Outlet } from 'react-router'

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
          'h-12.5 shrink-0 flex items-center px-4 select-none',
          isElectron ? 'electron-drag' : '',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2 electron-no-drag',
            isMac ? 'pl-20' : '',
          )}
        >
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className='p-2 -ml-2 rounded-md hover:bg-muted hover:text-foreground text-muted-foreground transition-all duration-200 cursor-pointer outline-none border-none'
            title='Toggle Sidebar'
          >
            <PanelLeft className='h-4 w-4' />
          </button>
        </div>
      </header>

      <div className='flex-1 flex min-w-0 overflow-hidden'>
        <AppSidebar
          onSettingsClick={() => setSettingsOpen(true)}
          isOpen={sidebarOpen}
        />
        <main className='flex-1 flex flex-col overflow-hidden'>
          <div className='flex-1 flex flex-col overflow-auto bg-background shadow-sm rounded-tl-lg'>
            <Outlet />
          </div>
        </main>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

export default Dashboard
