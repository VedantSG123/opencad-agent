import { useState } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  extractErrorMessage,
  useDeleteProject,
  useInvalidateProjects,
} from '@/hooks/useProjects'
import type { Project } from '@/types/project'

interface DeleteDialogProps {
  project: Project | null
  onClose: () => void
}

export function DeleteDialog({ project, onClose }: DeleteDialogProps) {
  const { mutateAsync: deleteProject } = useDeleteProject()
  const { invalidateProjects } = useInvalidateProjects()
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleConfirm() {
    if (!project) return
    setIsDeleting(true)
    try {
      await deleteProject(project.id)
      await invalidateProjects()
      if (window.electron) {
        const res = await window.electron.refreshProjectRoots()
        if (!res.success) {
          throw new Error(res.error.message)
        }
      }
      toast.success('Project deleted')
      onClose()
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Failed to delete project'))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog open={!!project} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Project</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete{' '}
            <strong>&quot;{project?.name}&quot;</strong>? This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isDeleting}
            className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
