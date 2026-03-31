import { Check } from 'lucide-react'

import { KERNEL_INFO } from '@/constants/kernels'
import { cn } from '@/lib/utils'
import type { CadKernel } from '@/types/project'

interface KernelStepProps {
  selected: CadKernel | null
  onSelect: (kernel: CadKernel) => void
}

export function KernelStep({ selected, onSelect }: KernelStepProps) {
  return (
    <div className='space-y-4'>
      <div className='text-center'>
        <p className='font-semibold text-base'>Choose a CAD Kernel</p>
        <p className='text-muted-foreground text-sm mt-0.5'>
          Select the scripting engine for your project
        </p>
      </div>
      <div className='grid grid-cols-2 gap-3'>
        {(
          Object.entries(KERNEL_INFO) as [
            CadKernel,
            (typeof KERNEL_INFO)[CadKernel],
          ][]
        ).map(([key, info]) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={cn(
              'flex flex-col items-center gap-3 p-5 rounded-xl border-2 cursor-pointer transition-all text-center relative',
              'hover:border-primary hover:bg-primary/5',
              selected === key
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card',
            )}
          >
            <div className='relative'>
              <img
                src={info.image}
                alt={info.label}
                className='w-14 h-14 object-contain'
              />
              {selected === key && (
                <div className='absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center'>
                  <Check className='w-3 h-3 text-primary-foreground' />
                </div>
              )}
            </div>
            <div>
              <p className='font-semibold text-sm'>{info.label}</p>
              <p className='text-muted-foreground text-xs mt-0.5 leading-relaxed'>
                {info.description}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
