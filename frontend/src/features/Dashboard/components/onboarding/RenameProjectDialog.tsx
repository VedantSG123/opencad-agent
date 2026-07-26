import { Button, Input, Label, Modal } from '@heroui/react'
import { useState } from 'react'

import { joinPaths } from '@/lib/utils'

interface RenameProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentDirectory: string
  defaultName: string
  onConfirm: (name: string) => void
}

export function RenameProjectDialog({
  open,
  onOpenChange,
  parentDirectory,
  defaultName,
  onConfirm,
}: RenameProjectDialogProps) {
  const [name, setName] = useState(defaultName)
  const [prevOpen, setPrevOpen] = useState(open)

  // Reset the editable name to the freshly-computed default each time the
  // dialog transitions to open, without a setState-in-effect cascade.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setName(defaultName)
  }

  const trimmedName = name.trim()

  function handleConfirm() {
    if (!trimmedName) return
    onConfirm(trimmedName)
    onOpenChange(false)
  }

  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
        <Modal.Container>
          <Modal.Dialog className='dark:shadow-none'>
            <Modal.CloseTrigger />
            <Modal.Header>
              <div className='flex flex-col gap-1'>
                <h3 className='text-xl font-semibold'>Name your project</h3>
                <p className='text-sm font-normal text-default-500'>
                  This will be the folder created inside the selected directory
                </p>
              </div>
            </Modal.Header>
            <Modal.Body className='space-y-3'>
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='rename-project-name'>Project name</Label>
                <Input
                  id='rename-project-name'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirm()
                  }}
                />
              </div>
              {trimmedName && (
                <p className='text-xs font-mono text-foreground/60 truncate'>
                  {joinPaths(parentDirectory, trimmedName)}
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant='ghost' onPress={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                className='bg-accent text-accent-foreground'
                onPress={handleConfirm}
                isDisabled={!trimmedName}
              >
                Confirm
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
