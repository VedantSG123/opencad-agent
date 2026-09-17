import {
  PythonEnvHeading,
  PythonEnvPanel,
} from '@/components/python/PythonEnvPanel'
import { usePythonEnv } from '@/hooks/usePythonEnv'

export function Build123dViewport() {
  const env = usePythonEnv()
  const isReady = env.status?.state === 'ready'

  // The renderer lands in a later phase. Until it does, a ready environment is
  // all there is to report, and saying so beats an empty canvas that looks
  // like a failed build.
  if (isReady) {
    return (
      <div className='h-full flex flex-col items-center justify-center gap-2 px-6 text-center'>
        <p className='text-sm text-foreground/60'>
          The build123d environment is ready.
        </p>
        <p className='text-xs text-muted-foreground'>
          The viewport arrives with the renderer.
        </p>
      </div>
    )
  }

  return (
    <div className='h-full overflow-y-auto flex items-center justify-center p-6'>
      <div className='w-full max-w-md flex flex-col gap-4 rounded-xl border border-border bg-surface p-5'>
        <PythonEnvHeading />
        <PythonEnvPanel env={env} />
      </div>
    </div>
  )
}
