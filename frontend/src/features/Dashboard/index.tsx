import { PanelLeft } from 'lucide-react'
import { useState } from 'react'
import { Outlet, useLocation } from 'react-router'

import { AppSidebar } from './components/AppSidebar'
import { SettingsDialog } from './components/SettingsDialog'

export { DashboardView } from './components/DashboardView'
export { ProjectsView } from './components/ProjectsView'

export function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const location = useLocation()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const isElectron = typeof window !== 'undefined' && !!window.electron
  const isMac = isElectron && window.electron?.platform === 'darwin'
  const isWinOrLinux = isElectron && window.electron?.platform !== 'darwin'

  const currentView =
    location.pathname === '/projects' ? 'projects' : 'dashboard'

  return (
    <div className='flex h-screen w-full overflow-hidden'>
      <AppSidebar
        onSettingsClick={() => setSettingsOpen(true)}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        isOpen={sidebarOpen}
      />
      <div className='flex-1 flex flex-col bg-background min-w-0'>
        <header
          className={`h-14 shrink-0 flex items-center px-4 border-b border-border select-none ${
            isElectron ? 'electron-drag' : ''
          }`}
        >
          <div
            className={`flex items-center gap-2 electron-no-drag ${
              isMac ? 'pl-[80px]' : ''
            } ${isWinOrLinux ? 'pr-[140px]' : ''}`}
          >
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className='p-2 -ml-2 rounded-md hover:bg-muted hover:text-foreground transition-all duration-200 cursor-pointer'
              title='Toggle Sidebar'
            >
              <PanelLeft className='h-4 w-4' />
            </button>
            <span className='font-semibold capitalize select-none'>
              {currentView}
            </span>
          </div>
        </header>

        <main className='flex-1 flex flex-col overflow-auto bg-background/50'>
          <Outlet />
        </main>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

export default Dashboard
