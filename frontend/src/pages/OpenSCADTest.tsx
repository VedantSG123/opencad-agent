import * as React from 'react'
import * as THREE from 'three'

import { OpenSCADViewer } from '../components-3d/cad-viewer/OpenSCADViewer'
import { NodeOpenSCADProvider, useNodeOpenSCAD } from '../hooks/useNodeOpenSCAD'

THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

const DEFAULT_SCRIPT = `
// Example OpenSCAD script
difference() {
  cube([20, 20, 20], center = true);
  sphere(r = 12);
}
`

function NodeOpenSCADTestInner() {
  const result = useNodeOpenSCAD((state) => state.result)
  const error = useNodeOpenSCAD((state) => state.error)
  const compile = useNodeOpenSCAD((state) => state.compile)
  const isCompiling = useNodeOpenSCAD((state) => state.isCompiling)

  React.useEffect(() => {
    compile({
      path: '/input.scad',
      code: DEFAULT_SCRIPT.trim(),
    })
  }, [compile])

  return (
    <div className='w-full h-screen fixed top-0 left-0 -z-10 bg-background'>
      <div className='absolute top-4 right-4 z-10 text-xs text-muted-foreground'>
        Node worker {isCompiling ? 'compiling...' : 'idle'}
      </div>
      <OpenSCADViewer result={result} hasError={!!error} />
    </div>
  )
}

export default function OpenSCADTest() {
  return (
    <NodeOpenSCADProvider>
      <NodeOpenSCADTestInner />
    </NodeOpenSCADProvider>
  )
}
