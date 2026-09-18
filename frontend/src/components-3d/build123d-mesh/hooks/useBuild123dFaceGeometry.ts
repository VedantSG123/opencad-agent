import { useThree } from '@react-three/fiber'
import * as React from 'react'
import * as THREE from 'three'

import type { DecodedInstance } from '@/kernels/build123d/decode'

/**
 * Face geometry, with one draw group per BRep face.
 *
 * `trianglesPerFace` is a triangle count per face, so the groups it implies are
 * what makes a face pickable and separately colourable - the same job
 * replicad's `faceGroups` does.
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
    geometry.setIndex(new THREE.BufferAttribute(instance.triangles, 1))

    geometry.clearGroups()
    let start = 0
    for (let face = 0; face < instance.trianglesPerFace.length; face++) {
      const count = instance.trianglesPerFace[face] * 3
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
