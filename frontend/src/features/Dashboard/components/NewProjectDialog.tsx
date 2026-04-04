import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CreateProjectPayload } from '@/hooks/useProjects'
import { useCreateProject } from '@/hooks/useProjects'

import { ProjectWizard } from './wizard'

interface NewProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewProjectDialog({
  open,
  onOpenChange,
}: NewProjectDialogProps) {
  const { mutate, isPending } = useCreateProject()

  function handleComplete(payload: CreateProjectPayload) {
    mutate(payload, { onSuccess: () => onOpenChange(false) })
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
          isLoading={isPending}
        />
      </DialogContent>
    </Dialog>
  )
}
