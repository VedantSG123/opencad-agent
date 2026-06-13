import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { KERNEL_INFO } from '@/constants/kernels'
import {
  extractErrorMessage,
  useInvalidateProjects,
  useSetProjectFile,
} from '@/hooks/useProjects'
import { cn } from '@/lib/utils'

import { useEditor } from './context'

interface SetMainFileDialogProps {
  open: boolean
  onClose: () => void
}

export function SetMainFileDialog({ open, onClose }: SetMainFileDialogProps) {
  const { project, treeData } = useEditor()
  const { mutateAsync: setProjectFile } = useSetProjectFile()
  const { invalidateProjects } = useInvalidateProjects()
  const [isSaving, setIsSaving] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  if (!project) return null

  const ext = KERNEL_INFO[project.cad_kernel].fileExtension
  const eligibleFiles = treeData.filter(
    (item) => !item.children && item.id.endsWith(ext),
  )

  async function handleConfirm() {
    if (!project || !selected) return
    // Virtual path is e.g. "/main.js"; absolute = directory + virtual path
    const absolutePath = project.directory + selected
    setIsSaving(true)
    try {
      await setProjectFile({ id: project.id, file: absolutePath })
      await invalidateProjects()
      toast.success('Main file updated successfully')
      setSelected(null)
      onClose()
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Failed to set main file'))
    } finally {
      setIsSaving(false)
    }
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setSelected(null)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-w-sm'>
        <DialogHeader>
          <DialogTitle>Set Main File</DialogTitle>
          <DialogDescription>
            Choose the entry-point{' '}
            <span className='font-medium text-foreground'>{ext}</span> file from
            the root of your project. This is the script the CAD kernel will
            execute.
          </DialogDescription>
        </DialogHeader>

        {eligibleFiles.length === 0 ? (
          <p className='text-sm text-muted-foreground py-2'>
            No <span className='font-medium'>{ext}</span> files found in the
            project root. Add one and try again.
          </p>
        ) : (
          <ul className='space-y-1 py-1'>
            {eligibleFiles.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setSelected(item.id)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                    selected === item.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50 text-foreground',
                  )}
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className='flex justify-end gap-2 pt-1'>
          <Button variant='outline' onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selected || isSaving}>
            {isSaving ? 'Saving…' : 'Set as Main File'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
