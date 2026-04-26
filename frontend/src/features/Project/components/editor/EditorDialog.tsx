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
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useEditor } from './context'

function fileName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

export function EditorDialog() {
  const { dialogState } = useEditor()

  const isOpen = dialogState !== null

  if (!isOpen) return null

  return (
    <AlertDialog open>
      <AlertDialogContent>
        {dialogState.type === 'close-confirm' && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
              <AlertDialogDescription>
                Do you want to save the changes made to{' '}
                <span className='font-medium text-foreground'>
                  {fileName(dialogState.path)}
                </span>
                ?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={dialogState.onCancel}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={dialogState.onDiscard}
                className={cn(buttonVariants({ variant: 'destructive' }))}
              >
                Don&apos;t Save
              </AlertDialogAction>
              <AlertDialogAction onClick={() => void dialogState.onSave()}>
                Save
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}

        {dialogState.type === 'external-conflict' && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>File Modified Externally</AlertDialogTitle>
              <AlertDialogDescription>
                <span className='font-medium text-foreground'>
                  {fileName(dialogState.path)}
                </span>{' '}
                has been modified externally. You have unsaved changes that
                would be overwritten. What would you like to do?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={dialogState.onKeepMine}>
                Keep My Changes
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={dialogState.onKeepExternal}
                className={cn(buttonVariants({ variant: 'destructive' }))}
              >
                Accept External Changes
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
