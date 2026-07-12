import { useState } from 'react'
import { Outlet, useLocation } from 'react-router'

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'

import { AppSidebar } from './components/AppSidebar'
import { SettingsDialog } from './components/SettingsDialog'

export { DashboardView } from './components/DashboardView'
export { ProjectsView } from './components/ProjectsView'

function DashboardLayoutInner() {
  const { open } = useSidebar()
  const location = useLocation()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const isElectron = typeof window !== 'undefined' && !!window.electron
  const isMac = isElectron && window.electron?.platform === 'darwin'
  const isWinOrLinux = isElectron && window.electron?.platform !== 'darwin'

  const currentView =
    location.pathname === '/projects' ? 'projects' : 'dashboard'

  return (
    <>
      <AppSidebar onSettingsClick={() => setSettingsOpen(true)} />
      <SidebarInset className='min-h-screen flex flex-col bg-background'>
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
            {!open && (
              <SidebarTrigger className='hover:bg-muted hover:text-foreground transition-all duration-200' />
            )}
            <span className='font-semibold capitalize select-none'>
              {currentView}
            </span>
          </div>
        </header>

        <main className='flex-1 flex flex-col overflow-auto bg-background/50'>
          <Outlet />
        </main>
      </SidebarInset>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}

export function Dashboard() {
  return (
    <SidebarProvider>
      <DashboardLayoutInner />
    </SidebarProvider>
  )
}
export default Dashboard
