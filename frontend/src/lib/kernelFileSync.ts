import { kernelFilesStore } from '@/hooks/useKernelFiles'
import type { WatchEvent } from '@/types/electron'

const SOURCE_FILE = /\.(?:py|[cm]?[jt]sx?|scad)$/i
const INPUT_ASSET =
  /\.(?:step|stp|brep|brp|iges|igs|stl|obj|ply|off|3mf|amf|svg|dxf|jsonc?|csv|tsv|ya?ml|toml|txt|dat|png|jpe?g|bmp|tiff?|webp)$/i
const GENERATED_DIRECTORIES = new Set([
  '__pycache__',
  'node_modules',
  'venv',
  'dist',
  'build',
  'output',
  'exports',
])

function ignoredPath(path: string) {
  return path
    .split('/')
    .some(
      (part) =>
        part.startsWith('.') || GENERATED_DIRECTORIES.has(part.toLowerCase()),
    )
}

export function createKernelFileSync({
  readFile,
  isDirty,
}: {
  readFile: (path: string) => Promise<string>
  isDirty: (path: string) => boolean
}) {
  let disposed = false
  const reading = new Map<string, symbol>()

  return {
    async handle(event: WatchEvent) {
      const { path, type } = event
      if (disposed || ignoredPath(path)) return

      reading.delete(path)
      const state = kernelFilesStore.getState()
      const isDirectory = type === 'addDir' || type === 'unlinkDir'
      const isRelevant =
        isDirectory ||
        SOURCE_FILE.test(path) ||
        INPUT_ASSET.test(path) ||
        path in state.files

      if (type === 'unlinkDir') {
        for (const pendingPath of reading.keys()) {
          if (pendingPath.startsWith(path + '/')) reading.delete(pendingPath)
        }
        for (const filePath of Object.keys(state.files)) {
          if (filePath.startsWith(path + '/') && !isDirty(filePath))
            state.clearFile(filePath)
        }
      } else if (isDirty(path)) {
        return
      } else if (type === 'unlink') {
        state.clearFile(path)
      }

      if (isRelevant) state.invalidateFilesystem()
      if (type !== 'change' && type !== 'add') return
      if (!SOURCE_FILE.test(path) && !(path in state.files)) return

      const token = Symbol(path)
      const previous = state.files[path]
      reading.set(path, token)
      try {
        const content = await readFile(path)
        const current = kernelFilesStore.getState()
        if (
          disposed ||
          reading.get(path) !== token ||
          isDirty(path) ||
          current.files[path] !== previous
        )
          return
        current.setFileContent(path, content)
      } catch {
        const current = kernelFilesStore.getState()
        if (
          !disposed &&
          reading.get(path) === token &&
          !isDirty(path) &&
          current.files[path] === previous
        )
          current.clearFile(path)
      } finally {
        if (reading.get(path) === token) reading.delete(path)
      }
    },
    dispose() {
      disposed = true
      reading.clear()
    },
  }
}
