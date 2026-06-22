import { useCallback, useState } from 'react'
import { toast } from 'sonner'

type FileDialogMode = 'file' | 'directory'

export function useFileDialog() {
  const [isLoading, setIsLoading] = useState(false)

  const open = useCallback(
    (
      mode: FileDialogMode,
      onSuccess: (path: string) => void,
      extension?: string,
    ) => {
      if (!window.electron) {
        toast.error('Electron environment not available')
        return
      }

      setIsLoading(true)
      window.electron
        .openFileDialog({ mode, extension })
        .then((result) => {
          if (!result.success) {
            toast.error(result.error.message)
            return
          }
          const { canceled, filePaths } = result.data
          if (canceled || filePaths.length === 0) {
            toast.info('Selection was cancelled')
            return
          }
          onSuccess(filePaths[0])
        })
        .catch((err: unknown) => {
          const msg =
            err instanceof Error ? err.message : 'Failed to open file dialog'
          toast.error(msg)
        })
        .finally(() => {
          setIsLoading(false)
        })
    },
    [],
  )

  return {
    open,
    stop: () => {},
    isLoading,
    isStreaming: false,
    isError: false,
    isActive: isLoading,
    result: null,
  }
}
