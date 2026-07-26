import { Modal } from '@heroui/react'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  extractErrorMessage,
  useCreateProject,
  useInvalidateProjects,
} from '@/hooks/useProjects'
import type { CreateProjectPayload } from '@/types/project'

import { ProjectWizard } from './wizard'

interface NewProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewProjectDialog({
  open,
  onOpenChange,
}: NewProjectDialogProps) {
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
      onOpenChange(false)
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Failed to create project'))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
        <Modal.Container>
          <Modal.Dialog className='dark:shadow-none'>
            <Modal.CloseTrigger />
            <Modal.Header>
              <div className='flex flex-col gap-1'>
                <h3 className='text-xl font-semibold'>New Project</h3>
                <p className='text-sm font-normal text-default-500'>
                  Create or import a CAD project
                </p>
              </div>
            </Modal.Header>
            <Modal.Body className='p-1'>
              <ProjectWizard
                onComplete={handleComplete}
                onCancel={() => onOpenChange(false)}
                isLoading={isCreating}
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
