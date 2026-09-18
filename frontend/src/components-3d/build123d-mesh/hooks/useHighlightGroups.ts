import { useThree } from '@react-three/fiber'
import * as React from 'react'
import type * as THREE from 'three'

/**
 * Point the named draw groups at the highlight material.
 *
 * The groups are already one per BRep face or edge, so selecting one is a
 * material index rather than a second geometry - which is why the mesh carries
 * two materials and nothing has to be rebuilt when the selection moves.
 */
export function useHighlightGroups(
  geometry: THREE.BufferGeometry,
  highlighted: number[],
) {
  const { invalidate } = useThree()

  React.useLayoutEffect(() => {
    const selected = new Set(highlighted)
    for (let group = 0; group < geometry.groups.length; group++) {
      geometry.groups[group].materialIndex = selected.has(group) ? 1 : 0
    }
    invalidate()
  }, [geometry, highlighted, invalidate])
}
