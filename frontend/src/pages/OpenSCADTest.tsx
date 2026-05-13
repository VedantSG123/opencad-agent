import * as React from 'react'
import * as THREE from 'three'

import { OpenSCADViewer } from '../components-3d/cad-viewer/OpenSCADViewer'
import { useOpenSCAD } from '../hooks/useOpenSCAD'

THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

const DEFAULT_SCRIPT = `
// Example OpenSCAD script
difference() {
  cube([20, 20, 20], center = true);
  sphere(r = 12);
}
`

export default function OpenSCADTest() {
  const result = useOpenSCAD((state) => state.result)
  const error = useOpenSCAD((state) => state.error)
  const compile = useOpenSCAD((state) => state.compile)

  React.useEffect(() => {
    compile({
      path: '/input.scad',
      code: DEFAULT_SCRIPT.trim(),
    })
  }, [compile])

  return (
    <div className='w-full h-screen fixed top-0 left-0 -z-10 bg-background'>
      <OpenSCADViewer result={result} hasError={!!error} />
    </div>
  )
}
