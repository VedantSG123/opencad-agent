import * as React from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

import { OpenSCADSVGViewer } from '@/components/custom/SvgViewer'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import type { CompileResult } from '@/kernels/openscad/OpenSCADWrapper'

import { Canvas } from './Canvas'
import { ErrorMesh } from './ErrorMesh'
import { Scene } from './Scene'

function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1} />
      <directionalLight position={[-10, -5, -10]} intensity={0.3} />
    </>
  )
}

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

  React.useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [])

  if (result?.format === 'svg' && result.blob) {
    return <OpenSCADSVGViewer blob={result.blob} />
  }

  return (
    <ErrorBoundary
      fallback={
        <div className='absolute inset-0 flex items-center justify-center text-sm text-muted-foreground'>
          3D viewer error — try rebuilding
        </div>
      }
    >
      <Canvas
        key='3d'
        orthographic
        onCreated={(state) => (state.gl.localClippingEnabled = true)}
      >
        <Scene>
          {hasError ? (
            <ErrorMesh />
          ) : (
            <>
              <SceneLighting />
              {geometry ? (
                <mesh geometry={geometry}>
                  <meshStandardMaterial
                    color='#6ea8be'
                    side={THREE.DoubleSide}
                    roughness={0.6}
                    metalness={0.1}
                  />
                </mesh>
              ) : null}
            </>
          )}
        </Scene>
      </Canvas>
    </ErrorBoundary>
  )
}
