import { useThree } from '@react-three/fiber'
import * as React from 'react'
import * as THREE from 'three'

import type { DecodedInstance } from '@/kernels/build123d/decode'

/**
 * Edge geometry, with one draw group per BRep edge.
 *
 * ocp_tessellate already emits two points per segment, which is exactly what
 * `LineSegments` draws - no index and no re-ordering. `segmentsPerEdge` turns
 * that flat run back into the edges a user can point at.
 */
export function useBuild123dEdgeGeometry(instance: DecodedInstance) {
  const { invalidate } = useThree()
  const geometry = React.useMemo(() => new THREE.BufferGeometry(), [])

  React.useLayoutEffect(() => {
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(instance.edges, 3),
    )

    geometry.clearGroups()
    let start = 0
    for (let edge = 0; edge < instance.segmentsPerEdge.length; edge++) {
      const count = instance.segmentsPerEdge[edge] * 2
      geometry.addGroup(start, count, 0)
      start += count
    }

    geometry.computeBoundingSphere()
    invalidate()
  }, [geometry, instance, invalidate])

  React.useEffect(() => {
    return () => {
      geometry.dispose()
      invalidate()
    }
  }, [geometry, invalidate])

  return geometry
}
