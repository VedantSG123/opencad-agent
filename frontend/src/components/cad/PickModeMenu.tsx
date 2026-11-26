import { Button, Dropdown } from '@heroui/react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'

import { Icon } from '@/components/icons/HugeIcon'

import type { PickMode } from './picks'
import { PICK_MODE_HINT, PICK_MODE_LABEL, PICK_MODES } from './picks'

export function PickModeMenu({
  value,
  onChange,
}: {
  value: PickMode
  onChange: (mode: PickMode) => void
}) {
  return (
    <Dropdown>
      <Button
        size='sm'
        variant='outline'
        className='pointer-events-auto rounded-lg bg-background/85 backdrop-blur-sm'
        aria-label={`Select: ${PICK_MODE_LABEL[value]}`}
      >
        <span className='text-foreground/50'>Select:</span>
        <span>{PICK_MODE_LABEL[value]}</span>
        <Icon icon={ArrowDown01Icon} size={12} />
      </Button>
      <Dropdown.Popover
        placement='bottom end'
        className='bg-background/85 backdrop-blur-sm border border-border'
      >
        <Dropdown.Menu
          aria-label='What a click selects'
          selectionMode='single'
          disallowEmptySelection
          selectedKeys={[value]}
          onSelectionChange={(keys) => {
            const mode =
              keys !== 'all' && PICK_MODES.find((mode) => keys.has(mode))
            if (mode) onChange(mode)
          }}
        >
          {PICK_MODES.map((mode) => (
            <Dropdown.Item
              key={mode}
              id={mode}
              textValue={PICK_MODE_LABEL[mode]}
            >
              <Dropdown.ItemIndicator />
              <div className='flex flex-col'>
                <span>{PICK_MODE_LABEL[mode]}</span>
                <span className='text-xs text-foreground/50'>
                  {PICK_MODE_HINT[mode]}
                </span>
              </div>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}
