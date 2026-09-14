import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

type FileEntry = {
  content: string
}

export type KernelFilesState = {
  files: Record<string, FileEntry>
  setFileContent: (path: string, content: string) => void
  clearFile: (path: string) => void
  clearAll: () => void
}

/**
 * Live file-content map fed by the Monaco editor on every keystroke.
 * CAD kernels read from here instead of the filesystem-backed EditorContext so
 * they always see the latest unsaved edits.
 *
 * This is a vanilla Zustand store so that CAD kernels can subscribe to it
 * outside of the React lifecycle.
 *
 * Keys are project-relative virtual paths (`/main.js`), so two projects collide
 * on the same entries — the map must be emptied via `clearAll` whenever a
 * project workspace is torn down, or the next project reads the previous
 * project's code.
 */
export const kernelFilesStore = createStore<KernelFilesState>((set) => ({
  files: {},
  setFileContent: (path, content) =>
    set((state) => ({
      files: {
        ...state.files,
        [path]: { content },
      },
    })),
  clearFile: (path) =>
    set((state) => {
      const { [path]: _removed, ...rest } = state.files
      return { files: rest }
    }),
  clearAll: () => set({ files: {} }),
}))

/**
 * React hook for consuming the kernel files store.
 */
export function useKernelFiles<T>(selector: (state: KernelFilesState) => T): T {
  return useStore(kernelFilesStore, selector)
}
