import { Label, Tabs } from '@heroui/react'
import { ComputerIcon, Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons'
import type { ThemeSetting } from 'shared'

import { Icon } from '@/components/icons/HugeIcon'
import { useTheme } from '@/contexts/theme-context'

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-1'>
        <h3 className='text-base font-semibold text-foreground'>Appearance</h3>
        <p className='text-sm text-muted-foreground'>
          Customize how OpenCAD Agent looks on your device.
        </p>
      </div>

      <div className='flex flex-col gap-2'>
        <Label className='text-sm font-medium'>Theme</Label>
        <Tabs
          selectedKey={theme}
          onSelectionChange={(key) => setTheme(key as ThemeSetting)}
          className='w-full max-w-sm'
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label='Theme'>
              <Tabs.Tab className='gap-1.5' id='light'>
                <Icon icon={Sun03Icon} size={16} />
                Light
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab className='gap-1.5' id='dark'>
                <Tabs.Separator />
                <Icon icon={Moon02Icon} size={16} />
                Dark
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab className='gap-1.5' id='system'>
                <Tabs.Separator />
                <Icon icon={ComputerIcon} size={16} />
                System
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>
    </div>
  )
}
