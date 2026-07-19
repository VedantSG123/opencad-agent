import { Label, ListBox, Modal } from '@heroui/react'
import { PaintBrush02Icon } from '@hugeicons/core-free-icons'
import { useState } from 'react'

import { Icon } from '@/components/icons/HugeIcon'
import { cn } from '@/lib/utils'

import { AppearanceSettings } from './settings/AppearanceSettings'

type SettingsCategory = 'appearance'

interface SettingsCategoryItem {
  id: SettingsCategory
  label: string
  icon: Parameters<typeof Icon>[0]['icon']
}

const SETTINGS_CATEGORIES: SettingsCategoryItem[] = [
  { id: 'appearance', label: 'Appearance', icon: PaintBrush02Icon },
]

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [category, setCategory] = useState<SettingsCategory>('appearance')

  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
        <Modal.Container size='lg'>
          <Modal.Dialog className='min-h-112 max-w-3xl w-full overflow-hidden p-0 dark:shadow-none'>
            <Modal.CloseTrigger />

            <div className='flex h-full min-h-0'>
              <div className='flex w-44 shrink-0 flex-col border-r border-border py-1 px-1'>
                <div className='px-3 pt-4 pb-2'>
                  <Modal.Heading className='text-sm font-semibold'>
                    Settings
                  </Modal.Heading>
                </div>
                <ListBox
                  aria-label='Settings categories'
                  selectionMode='none'
                  onAction={(key) => setCategory(key as SettingsCategory)}
                  className='w-full'
                >
                  {SETTINGS_CATEGORIES.map((item) => (
                    <ListBox.Item
                      key={item.id}
                      id={item.id}
                      textValue={item.label}
                      className={cn(
                        'text-sm font-medium rounded-xl',
                        category === item.id
                          ? 'bg-muted/20 text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      <Icon icon={item.icon} size={16} />
                      <Label>{item.label}</Label>
                    </ListBox.Item>
                  ))}
                </ListBox>
              </div>

              <div className='min-w-0 flex-1 overflow-y-auto p-6'>
                {category === 'appearance' && <AppearanceSettings />}
              </div>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
