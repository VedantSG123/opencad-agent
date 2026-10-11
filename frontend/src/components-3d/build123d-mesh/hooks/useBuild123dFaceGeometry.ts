import { useThree } from '@react-three/fiber'
import * as React from 'react'
import * as THREE from 'three'

import type { DecodedInstance } from '@/kernels/build123d/decode'

import { COMPONENT_ID_ATTRIBUTE } from '../../highlight/state'

/**
 * BRep face index per vertex.
 *
 * ocp_tessellate meshes each face on its own - a vertex spanning a sharp edge
 * would need two normals - so every vertex belongs to exactly one face and
 * walking the index buffer is enough to label them all.
 */
function faceIds(instance: DecodedInstance): Float32Array {
  const ids = new Float32Array(instance.vertices.length / 3)
  const { triangles, faceOffsets } = instance

  for (let face = 0; face < faceOffsets.length - 1; face++) {
    const end = faceOffsets[face + 1] * 3
    for (let i = faceOffsets[face] * 3; i < end; i++) {
      ids[triangles[i]] = face
    }
  }

  return ids
}

/**
 * Face geometry, with the BRep face index on every vertex.
 *
 * The ids replace the draw group per face this used to carry: groups cost a
 * draw call each, and `faceOfTriangle` picks from `faceOffsets` regardless.
 */
export function useBuild123dFaceGeometry(instance: DecodedInstance) {
  const { invalidate } = useThree()
  const geometry = React.useMemo(() => new THREE.BufferGeometry(), [])

  React.useLayoutEffect(() => {
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(instance.vertices, 3),
    )
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(instance.normals, 3),
    )
    if (instance.uvs) {
      geometry.setAttribute('uv', new THREE.BufferAttribute(instance.uvs, 2))
    }
    geometry.setAttribute(
      COMPONENT_ID_ATTRIBUTE,
      new THREE.BufferAttribute(faceIds(instance), 1),
    )
    geometry.setIndex(new THREE.BufferAttribute(instance.triangles, 1))

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
