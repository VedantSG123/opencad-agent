import { Folder, LayoutDashboard, Settings } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { usePlatform } from '@/hooks/usePlatform'
import { cn } from '@/lib/utils'

interface AppSidebarProps {
  onSettingsClick: () => void
  isOpen: boolean
}

export function AppSidebar({ onSettingsClick, isOpen }: AppSidebarProps) {
  const location = useLocation()
  const currentPath = location.pathname

  const { isWin } = usePlatform()

  return (
    <aside
      className={cn(
        'flex flex-col h-full shrink-0 overflow-hidden transition-all duration-300',
        isWin ? '' : 'border-r border-border',
        isOpen ? 'w-64' : 'w-0',
      )}
    >
      <div
        className={cn(
          'flex-1 flex flex-col min-w-64 transition-opacity duration-300',
          isOpen ? 'opacity-100 delay-150' : 'opacity-0',
        )}
      >
        <div className='flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-2'>
          <nav className='flex flex-col gap-1'>
            <Link
              to='/'
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                currentPath === '/'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <LayoutDashboard className='h-4 w-4' />
              <span>Dashboard</span>
            </Link>
            <Link
              to='/projects'
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                currentPath === '/projects'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <Folder className='h-4 w-4' />
              <span>Projects</span>
            </Link>
          </nav>
        </div>

        <div className='p-3 border-t border-border'>
          <button
            onClick={onSettingsClick}
            className='w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer outline-none'
          >
            <Settings className='h-4 w-4' />
            <span>Settings</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
