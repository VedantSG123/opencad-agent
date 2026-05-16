import * as React from 'react'

import { OpenSCADViewer } from '@/components-3d/cad-viewer/OpenSCADViewer'
import { OpenSCADProvider, useOpenSCAD } from '@/hooks/useOpenSCAD'

import { OpenSCADCompiler } from './OpenSCADCompiler'

function OpenSCADViewportInner() {
  const result = useOpenSCAD((state) => state.result)
  const error = useOpenSCAD((state) => state.error)
  const isCompiling = useOpenSCAD((state) => state.isCompiling)

  const hasError = Boolean(error)

  React.useEffect(() => {
    if (error) {
      console.error('OpenSCAD compilation error:', error)
    }
  }, [error])

  return (
    <div className='relative h-full w-full'>
      <OpenSCADViewer result={result} hasError={hasError} />
      {isCompiling && (
        <div className='absolute bottom-4 right-4 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-md border shadow-sm flex items-center gap-2 text-xs text-muted-foreground animate-in fade-in duration-200'>
          <div className='h-2 w-2 bg-blue-500 rounded-full animate-pulse' />
          Compiling...
        </div>
      )}
    </div>
  )
}

export function OpenSCADViewport() {
  return (
    <OpenSCADProvider>
      <OpenSCADCompiler />
      <OpenSCADViewportInner />
    </OpenSCADProvider>
  )
}
