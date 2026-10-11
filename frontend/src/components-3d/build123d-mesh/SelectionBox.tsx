import { useThree } from '@react-three/fiber'
import * as React from 'react'
import * as THREE from 'three'

import type { Bounds } from '@/kernels/build123d/bounds'

const SELECTION_COLOR = '#e832e8'

/** A flat part has a zero extent, which BoxGeometry cannot draw. */
const MIN_EXTENT = 1e-4

export function SelectionBox({ bounds }: { bounds: Bounds }) {
  const { invalidate } = useThree()

  const geometry = React.useMemo(() => {
    const [x, y, z] = bounds.size
    return new THREE.EdgesGeometry(
      new THREE.BoxGeometry(
        Math.max(x, MIN_EXTENT),
        Math.max(y, MIN_EXTENT),
        Math.max(z, MIN_EXTENT),
      ),
    )
  }, [bounds])

  React.useEffect(() => {
    invalidate()
    return () => {
      geometry.dispose()
      invalidate()
    }
  }, [geometry, invalidate])

  return (
    <lineSegments
      geometry={geometry}
      position={bounds.center}
      // Drawn over the model rather than through it: a box that the part it
      // surrounds can hide is no use for saying which part is selected.
      renderOrder={999}
    >
      <lineBasicMaterial
        color={SELECTION_COLOR}
        depthTest={false}
        transparent
      />
    </lineSegments>
  )
}
