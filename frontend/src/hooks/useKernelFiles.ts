import { create } from 'zustand'

type KernelFilesState = {
  files: Record<string, string>
  setFileContent: (path: string, content: string) => void
  clearFile: (path: string) => void
}

/**
 * Live file-content map fed by the Monaco editor on every keystroke.
 * CAD kernels read from here instead of the filesystem-backed EditorContext so
 * they always see the latest unsaved edits.
 */
export const useKernelFiles = create<KernelFilesState>((set) => ({
  files: {},
  setFileContent: (path, content) =>
    set((state) => ({ files: { ...state.files, [path]: content } })),
  clearFile: (path) =>
    set((state) => {
      const { [path]: _removed, ...rest } = state.files
      return { files: rest }
    }),
}))
