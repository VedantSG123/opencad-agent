import { Card } from '@heroui/react'
import { Layers01Icon } from '@hugeicons/core-free-icons'
import { useState } from 'react'
import { toast } from 'sonner'

import { Icon } from '@/components/icons/HugeIcon'
import {
  extractErrorMessage,
  useCreateProject,
  useInvalidateProjects,
} from '@/hooks/useProjects'
import type { CreateProjectPayload } from '@/types/project'

import { ProjectWizard } from './wizard'

export function OnboardingScreen() {
  const { mutateAsync: createProject } = useCreateProject()
  const { invalidateProjects } = useInvalidateProjects()
  const [isCreating, setIsCreating] = useState(false)

  async function handleComplete(payload: CreateProjectPayload) {
    setIsCreating(true)
    try {
      const created = await createProject(payload)
      await invalidateProjects()
      if (window.electron) {
        const res = await window.electron.addProjectRoot(created.directory)
        if (!res.success) {
          throw new Error(res.error.message)
        }
      }
      toast.success('Project created successfully')
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Failed to create project'))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className='flex flex-col items-center justify-center flex-1 px-4 py-16'>
      <div className='w-full max-w-[520px]'>
        <div className='text-center mb-8'>
          <div className='inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 mb-4'>
            <Icon icon={Layers01Icon} size={32} className='text-accent' />
          </div>
          <h2 className='text-2xl font-bold'>Welcome to OpenCAD Agent</h2>
          <p className='text-foreground/60 mt-2'>
            Create your first project to get started
          </p>
        </div>
        <Card>
          <Card.Content className='pt-6 pb-5 px-6'>
            <ProjectWizard onComplete={handleComplete} isLoading={isCreating} />
          </Card.Content>
        </Card>
      </div>
    </div>
  )
}
