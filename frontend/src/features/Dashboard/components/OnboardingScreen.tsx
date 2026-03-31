import { Layers } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useCreateProject } from '@/hooks/useProjects'

import { ProjectWizard } from './wizard'

export function OnboardingScreen() {
  const { mutate, isPending } = useCreateProject()

  return (
    <div className='flex flex-col items-center justify-center flex-1 px-4 py-16'>
      <div className='w-full max-w-[520px]'>
        <div className='text-center mb-8'>
          <div className='inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4'>
            <Layers className='w-8 h-8 text-primary' />
          </div>
          <h2 className='text-2xl font-bold'>Welcome to OpenCAD Agent</h2>
          <p className='text-muted-foreground mt-2'>
            Create your first project to get started
          </p>
        </div>
        <Card>
          <CardContent className='pt-6 pb-5 px-6'>
            <ProjectWizard
              onComplete={(payload) => mutate(payload)}
              isLoading={isPending}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
