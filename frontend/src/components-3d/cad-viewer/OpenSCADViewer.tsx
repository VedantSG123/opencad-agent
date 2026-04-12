import * as React from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

import { OpenSCADSVGViewer } from '@/components/custom/SvgViewer'
import type { CompileResult } from '@/kernels/openscad/OpenSCADWrapper'

import { Canvas } from './Canvas'
import { ErrorMesh } from './ErrorMesh'
import { Scene } from './Scene'

// ---------------------------------------------------------------------------
// Scene lighting environment
// ---------------------------------------------------------------------------

function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1} />
      <directionalLight position={[-10, -5, -10]} intensity={0.3} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

type OpenSCADViewerProps = {
  result: CompileResult | null
  hasError?: boolean
}

export function OpenSCADViewer({
  result,
  hasError = false,
}: OpenSCADViewerProps) {
  const [geometry, setGeometry] = React.useState<THREE.BufferGeometry | null>(
    null,
  )

  // Parse the STL blob asynchronously. Geometry state lives here so that when
  // it resolves, the children passed to Stage change — triggering Stage's
  // bounding-box layout effect and camera autofocus.
  React.useEffect(() => {
    const blob = result?.blob
    if (!blob || hasError || result?.format === 'svg') {
      setGeometry(null)
      return
    }

    let cancelled = false

    blob.arrayBuffer().then((buffer) => {
      if (cancelled) return
      const loader = new STLLoader()
      const geo = loader.parse(buffer)
      geo.computeVertexNormals()
      setGeometry((prev) => {
        prev?.dispose()
        return geo
      })
    })

    return () => {
      cancelled = true
    }
  }, [result?.blob, result?.format, hasError])

  // Dispose geometry on unmount
  React.useEffect(() => {
    return () => {
      geometry?.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2D output: delegate to the shared SVG viewer
  if (result?.format === 'svg' && result.blob) {
    return <OpenSCADSVGViewer blob={result.blob} />
  }

  return (
    <Canvas
      orthographic
      onCreated={(state) => (state.gl.localClippingEnabled = true)}
    >
      <Scene>
        {hasError || !geometry ? (
          <ErrorMesh />
        ) : (
          <>
            <SceneLighting />
            <mesh geometry={geometry}>
              <meshStandardMaterial
                color='#6ea8be'
                side={THREE.DoubleSide}
                roughness={0.6}
                metalness={0.1}
              />
            </mesh>
          </>
        )}
      </Scene>
    </Canvas>
  )
}
