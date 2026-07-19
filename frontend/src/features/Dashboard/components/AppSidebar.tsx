import {
  DashboardCircleIcon,
  Folder01Icon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import { NavLink } from 'react-router'

import { Icon } from '@/components/icons/HugeIcon'
import { cn } from '@/lib/utils'

interface AppSidebarProps {
  onSettingsClick: () => void
  isOpen: boolean
}

const sidebarItemClassName =
  'flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-sm font-medium transition-colors'
const sidebarItemInactiveClassName =
  'text-foreground hover:bg-muted/15 hover:text-foreground'

interface SidebarNavLinkProps {
  to: string
  icon: Parameters<typeof Icon>[0]['icon']
  children: React.ReactNode
}

function SidebarNavLink({ to, icon, children }: SidebarNavLinkProps) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          sidebarItemClassName,
          isActive ? 'bg-muted/20' : sidebarItemInactiveClassName,
        )
      }
    >
      <Icon icon={icon} />
      <span>{children}</span>
    </NavLink>
  )
}

export function AppSidebar({ onSettingsClick, isOpen }: AppSidebarProps) {
  return (
    <aside
      className={cn(
        'flex flex-col h-full shrink-0 overflow-hidden transition-all duration-300',
        isOpen ? 'w-64' : 'w-0',
      )}
    >
      <div
        className={cn(
          'flex-1 flex flex-col min-w-64 transition-opacity duration-300',
          isOpen ? 'opacity-100 delay-150' : 'opacity-0',
        )}
      >
        <div className='flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-1.5'>
          <nav className='flex flex-col gap-0.5'>
            <SidebarNavLink to='/' icon={DashboardCircleIcon}>
              Dashboard
            </SidebarNavLink>
            <SidebarNavLink to='/projects' icon={Folder01Icon}>
              Projects
            </SidebarNavLink>
          </nav>
        </div>

        <div className='p-2 border-t dark:border-border/60'>
          <button
            onClick={onSettingsClick}
            className={cn(
              sidebarItemClassName,
              sidebarItemInactiveClassName,
              'w-full cursor-pointer outline-none',
            )}
          >
            <Icon icon={Settings01Icon} />
            <span>Settings</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
