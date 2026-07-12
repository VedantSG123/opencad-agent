import { Layers } from 'lucide-react'

export function DashboardView() {
  return (
    <div className='flex-1 flex flex-col items-center justify-center p-6 text-center select-none'>
      <div className='relative group mb-6'>
        {/* Glow effect */}
        <div className='absolute -inset-1 rounded-2xl bg-gradient-to-r from-primary/30 to-violet-500/30 blur-lg opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200'></div>
        <div className='relative w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-xl border border-primary/20'>
          <Layers className='w-8 h-8 text-primary-foreground' />
        </div>
      </div>
      <h1 className='text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent sm:text-4xl'>
        OpenCAD Agent
      </h1>
      <p className='max-w-md mt-3 text-muted-foreground text-sm sm:text-base leading-relaxed'>
        An AI-powered design assistant for programmatic 3D CAD modeling. Toggle
        the sidebar or head over to the Projects tab to get started.
      </p>
    </div>
  )
}
