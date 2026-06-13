import { useState } from 'react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-130'>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>Create or import a CAD project</DialogDescription>
        </DialogHeader>
        <ProjectWizard
          onComplete={handleComplete}
          onCancel={() => onOpenChange(false)}
          isLoading={isCreating}
        />
      </DialogContent>
    </Dialog>
  )
}
