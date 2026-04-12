import * as React from 'react'
import * as THREE from 'three'

import { OpenSCADViewer } from '../components-3d/cad-viewer/OpenSCADViewer'
import { useOpenSCAD } from '../hooks/useOpenSCAD'

THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

export default function OpenSCADTest() {
  const result = useOpenSCAD((state) => state.result)
  const error = useOpenSCAD((state) => state.error)
  const compile = useOpenSCAD((state) => state.compile)
  const initWorker = useOpenSCAD((state) => state.initWorker)
  const workerReady = useOpenSCAD((state) => state.workerReady)

  React.useEffect(() => {
    initWorker()
  }, [initWorker])

  React.useEffect(() => {
    if (workerReady) {
      compile()
    }
  }, [compile, workerReady])

  if (!workerReady) {
    return (
      <div className='w-full h-full fixed top-0 left-0 -z-10 bg-background flex items-center justify-center text-foreground'>
        Loading OpenSCAD...
      </div>
    )
  }

  return (
    <div className='w-full h-screen fixed top-0 left-0 -z-10 bg-background'>
      <OpenSCADViewer result={result} hasError={!!error} />
    </div>
  )
}
