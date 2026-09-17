import { Button } from '@heroui/react'
import { Folder01Icon, Refresh01Icon } from '@hugeicons/core-free-icons'

import { Icon } from '@/components/icons/HugeIcon'
import { PythonEnvPanel } from '@/components/python/PythonEnvPanel'
import { usePythonEnv } from '@/hooks/usePythonEnv'

export function PythonSettings() {
  const env = usePythonEnv()
  const status = env.status
  const isSettled =
    !env.isBusy && status != null && status.state !== 'installing'

  const chooseOwn = async () => {
    const picked = await window.electron?.openFileDialog({ mode: 'file' })
    if (picked?.success && !picked.data.canceled && picked.data.filePaths[0]) {
      await env.chooseInterpreter(picked.data.filePaths[0])
    }
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-1'>
        <h3 className='text-base font-semibold text-foreground'>build123d</h3>
        <p className='text-sm text-muted-foreground'>
          The Python environment build123d projects are built in.
        </p>
      </div>

      <PythonEnvPanel env={env} />

      {isSettled ? (
        <div className='flex flex-wrap gap-2 pt-4'>
          <Button variant='outline' size='sm' onPress={() => void chooseOwn()}>
            <Icon icon={Folder01Icon} size={14} />
            Use my own interpreter
          </Button>
          {status.state !== 'not-installed' && (
            <Button
              variant='outline'
              size='sm'
              onPress={() => void env.repair()}
            >
              <Icon icon={Refresh01Icon} size={14} />
              Rebuild the environment
            </Button>
          )}
          {status.state === 'ready' && status.source === 'custom' && (
            <Button
              variant='outline'
              size='sm'
              onPress={() => void env.chooseInterpreter(null)}
            >
              Back to the managed one
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
