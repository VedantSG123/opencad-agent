import { Layers01Icon } from '@hugeicons/core-free-icons'

import { Icon } from '@/components/icons/HugeIcon'

export function DashboardView() {
  return (
    <div className='flex-1 flex flex-col items-center justify-center p-6 text-center select-none'>
      <div className='relative group mb-6'>
        {/* Glow effect */}
        <div className='absolute -inset-1 rounded-2xl bg-gradient-to-r from-accent/30 to-violet-500/30 blur-lg opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200'></div>
        <div className='relative w-16 h-16 rounded-2xl bg-accent flex items-center justify-center shadow-xl border border-accent/20'>
          <Icon
            icon={Layers01Icon}
            size={32}
            className='text-accent-foreground'
          />
        </div>
      </div>
      <h1 className='text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-foreground/60 bg-clip-text text-transparent sm:text-4xl'>
        OpenCAD Agent
      </h1>
      <p className='max-w-md mt-3 text-foreground/60 text-sm sm:text-base leading-relaxed'>
        An AI-powered design assistant for programmatic 3D CAD modeling. Toggle
        the sidebar or head over to the Projects tab to get started.
      </p>
    </div>
  )
}
