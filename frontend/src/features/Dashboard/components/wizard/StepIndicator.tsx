import { Tick01Icon } from '@hugeicons/core-free-icons'

import { Icon } from '@/components/icons/HugeIcon'
import { cn } from '@/lib/utils'

const STEP_LABELS = ['Choose Action', 'Select Kernel', 'Project Details']

export function StepIndicator({ step }: { step: number }) {
  return (
    <div className='flex items-center justify-center'>
      {STEP_LABELS.map((label, i) => {
        const num = i + 1
        const isActive = num === step
        const isDone = num < step
        return (
          <div key={num} className='flex items-center'>
            <div className='flex flex-col items-center gap-1.5'>
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all',
                  isDone && 'bg-accent border-accent text-accent-foreground',
                  isActive && 'border-accent text-accent bg-background',
                  !isDone &&
                    !isActive &&
                    'border-foreground/40 text-foreground/40 bg-background',
                )}
              >
                {isDone ? <Icon icon={Tick01Icon} size={16} /> : num}
              </div>
              <span
                className={cn(
                  'text-xs whitespace-nowrap',
                  isActive
                    ? 'text-foreground font-medium'
                    : 'text-foreground/60',
                )}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div
                className={cn(
                  'h-px w-14 mx-2 mb-5 transition-colors',
                  isDone ? 'bg-accent' : 'bg-foreground/40',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
