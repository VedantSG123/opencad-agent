import * as React from 'react'

import { useBuild123d } from '@/hooks/useBuild123d'
import {
  type KernelFilesState,
  kernelFilesStore,
  useKernelFiles,
} from '@/hooks/useKernelFiles'
import { joinPaths } from '@/lib/utils'

import { useEditor } from './editor/context'

// A build123d build spawns Python and takes seconds, where OpenSCAD's is
// milliseconds - so it waits longer for typing to stop than the others do.
const BUILD_DEBOUNCE_MS = 1500

function isPython(path: string) {
  return path.toLowerCase().endsWith('.py')
}

/**
 * Every Python buffer as one string.
 *
 * A string rather than the entries themselves because the store is read through
 * useSyncExternalStore, which compares with Object.is: a selector that built a
 * fresh array would report a change on every check and re-render without end.
 * Exported so that property can be asserted rather than assumed.
 */
export function selectPythonSources(state: KernelFilesState): string {
  return Object.entries(state.files)
    .filter(([path]) => isPython(path))
    .map(([path, file]) => `${path}:${file.content}`)
    .join(String.fromCharCode(10))
}

/**
 * Rebuilds when the Python buffers settle.
 *
 * Mounted only where the environment is already known to be ready, so it does
 * not ask again.
 */
export function Build123dCompiler() {
  const { project } = useEditor()
  const build = useBuild123d((state) => state.build)

  // project.file is already absolute; the store is keyed by project-relative
  // virtual paths, so the overrides below are the ones needing conversion.
  const mainFilePath = React.useMemo(() => {
    if (!project?.file || !project.directory) return null
    if (!isPython(project.file)) return null
    return project.file
  }, [project])

  const serialized = useKernelFiles(selectPythonSources)

  React.useEffect(() => {
    if (!mainFilePath) {
      return
    }

    const timer = setTimeout(() => {
      // Read at build time rather than subscribed to: the effect already knows
      // the content changed, and this keeps one reactive dependency on the
      // store instead of two.
      const overrides: Record<string, string> = {}
      for (const [path, file] of Object.entries(
        kernelFilesStore.getState().files,
      )) {
        if (isPython(path)) {
          overrides[joinPaths(project.directory, path)] = file.content
        }
      }

      void build({
        mainPath: mainFilePath,
        projectDirectory: project.directory,
        overrides,
      })
    }, BUILD_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [serialized, mainFilePath, project.directory, build])

  return null
}
