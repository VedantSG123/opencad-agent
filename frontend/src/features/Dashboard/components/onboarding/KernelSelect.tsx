import { Label, ListBox, Select } from '@heroui/react'

import { KERNEL_INFO } from '@/constants/kernels'
import type { CadKernel } from '@/types/project'

interface KernelSelectProps {
  value: CadKernel
  onChange: (kernel: CadKernel) => void
}

export function KernelSelect({ value, onChange }: KernelSelectProps) {
  return (
    <Select
      className='w-auto'
      value={value}
      onChange={(key) => onChange(key as CadKernel)}
    >
      <Label className='sr-only'>CAD kernel</Label>
      <Select.Trigger className='gap-1.5 bg-default rounded-full'>
        {/* Select.Value renders the selected ListBox.Item's full children
            (icon + label) by default, so no icon is duplicated here. */}
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {Object.entries(KERNEL_INFO).map(([id, kernelInfo]) => (
            <ListBox.Item key={id} id={id} textValue={kernelInfo.label}>
              <div className='flex items-center gap-2 min-w-30'>
                <img
                  src={kernelInfo.image}
                  alt=''
                  className='h-4 w-4 object-contain'
                />
                <span>{kernelInfo.label}</span>
              </div>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}
