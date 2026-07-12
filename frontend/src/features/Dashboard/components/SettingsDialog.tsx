import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[425px]'>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your application preferences and settings here.
          </DialogDescription>
        </DialogHeader>
        <div className='py-6 flex flex-col items-center justify-center text-center text-muted-foreground text-sm select-none'>
          Settings options will be implemented here.
        </div>
      </DialogContent>
    </Dialog>
  )
}
