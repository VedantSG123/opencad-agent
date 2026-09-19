import { useThree } from '@react-three/fiber'
import * as React from 'react'
import * as THREE from 'three'

import type { DecodedInstance } from '@/kernels/build123d/decode'

import { COMPONENT_ID_ATTRIBUTE } from '../../highlight/state'

/**
 * BRep edge index per vertex.
 *
 * ocp_tessellate already emits two points per segment, unindexed, which is what
 * `LineSegments` draws - so the ids are a run per edge with no lookup.
 */
function edgeIds(instance: DecodedInstance): Float32Array {
  const ids = new Float32Array(instance.edges.length / 3)
  let vertex = 0

  for (let edge = 0; edge < instance.segmentsPerEdge.length; edge++) {
    const count = instance.segmentsPerEdge[edge] * 2
    ids.fill(edge, vertex, vertex + count)
    vertex += count
  }

  return ids
}

/**
 * Edge geometry, with the BRep edge index on every vertex.
 *
 * The ids replace the draw group per edge this used to carry: groups cost a
 * draw call each, and `edgeOfVertex` picks from `edgeOffsets` regardless.
 */
export function useBuild123dEdgeGeometry(instance: DecodedInstance) {
  const { invalidate } = useThree()
  const geometry = React.useMemo(() => new THREE.BufferGeometry(), [])

  React.useLayoutEffect(() => {
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(instance.edges, 3),
    )
    geometry.setAttribute(
      COMPONENT_ID_ATTRIBUTE,
      new THREE.BufferAttribute(edgeIds(instance), 1),
    )

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
