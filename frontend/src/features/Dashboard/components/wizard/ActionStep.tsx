import { FilePlus, FolderOpen } from 'lucide-react'

import { cn } from '@/lib/utils'

type WizardAction = 'create' | 'open'

const ACTIONS: {
  key: WizardAction
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
}[] = [
  {
    key: 'create',
    icon: FilePlus,
    title: 'Create New Project',
    desc: 'Start from scratch with a blank CAD script',
  },
  {
    key: 'open',
    icon: FolderOpen,
    title: 'Open Existing Script',
    desc: 'Import an existing CAD script file into a project',
  },
]

interface ActionStepProps {
  selected: WizardAction | null
  onSelect: (action: WizardAction) => void
}

export function ActionStep({ selected, onSelect }: ActionStepProps) {
  return (
    <div className='space-y-4'>
      <div className='text-center'>
        <p className='font-semibold text-base'>What would you like to do?</p>
        <p className='text-default-500 text-sm mt-0.5'>
          Choose how you&apos;d like to start
        </p>
      </div>
      <div className='grid grid-cols-2 gap-3'>
        {ACTIONS.map(({ key, icon: Icon, title, desc }) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={cn(
              'flex flex-col items-center gap-3 p-5 rounded-xl border-2 cursor-pointer transition-all text-center',
              'hover:border-accent-soft hover:bg-accent-soft',
              selected === key
                ? 'border-accent-soft bg-accent-soft'
                : 'border-default bg-surface',
            )}
          >
            <div
              className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center transition-colors',
                selected === key
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-default text-default-500',
              )}
            >
              <Icon className='w-5 h-5' />
            </div>
            <div>
              <p className='font-semibold text-sm'>{title}</p>
              <p className='text-default-500 text-xs mt-0.5 leading-relaxed'>
                {desc}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
