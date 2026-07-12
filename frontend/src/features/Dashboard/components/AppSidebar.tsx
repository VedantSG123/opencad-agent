import { Folder, LayoutDashboard, Settings } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from '@/components/ui/sidebar'

interface AppSidebarProps {
  onSettingsClick: () => void
}

export function AppSidebar({ onSettingsClick }: AppSidebarProps) {
  const location = useLocation()
  const currentPath = location.pathname

  return (
    <Sidebar
      collapsible='offcanvas'
      className='bg-background'
      innerClassName='bg-background'
    >
      <SidebarHeader>
        <div className='w-full flex justify-end mt-1'>
          <SidebarTrigger className='hover:bg-sidebar-accent hover:text-sidebar-accent-foreground' />
        </div>
      </SidebarHeader>

      <SidebarContent className='py-4'>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={currentPath === '/'}
                  asChild
                  tooltip='Dashboard'
                  className='transition-all duration-200'
                >
                  <Link to='/'>
                    <LayoutDashboard className='h-4 w-4' />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={currentPath === '/projects'}
                  asChild
                  tooltip='Projects'
                  className='transition-all duration-200'
                >
                  <Link to='/projects'>
                    <Folder className='h-4 w-4' />
                    <span>Projects</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className='p-2'>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onSettingsClick}
              tooltip='Settings'
              className='transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            >
              <Settings className='h-4 w-4' />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
