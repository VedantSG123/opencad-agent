import { useThree } from '@react-three/fiber'
import * as React from 'react'
import type { ReplicadMeshedEdges } from 'replicad-threejs-helper'
import { syncLines } from 'replicad-threejs-helper'
import * as THREE from 'three'

import { COMPONENT_ID_ATTRIBUTE } from '../../highlight/state'

type EdgeGroup = { start: number; count: number; edgeId: number }

/**
 * Copy replicad's draw groups onto the vertices as ids.
 *
 * The id is the group's position in the list, matching what `getEdgeIndex`
 * reports. `syncLines` counts in vertices - the line geometry has no index
 * buffer - so a group is already the run to label.
 */
function applyEdgeIds(geometry: THREE.BufferGeometry) {
  const groups = geometry.userData.edgeGroups as EdgeGroup[] | undefined
  const position = geometry.getAttribute('position')
  if (!groups || !position) return

  const ids = new Float32Array(position.count)
  groups.forEach(({ start, count }, group) => {
    ids.fill(group, start, start + count)
  })

  geometry.setAttribute(
    COMPONENT_ID_ATTRIBUTE,
    new THREE.BufferAttribute(ids, 1),
  )
}

export const useReplicadEdgeGeometry = (
  edges: ReplicadMeshedEdges,
  highlight: number[],
) => {
  const { invalidate } = useThree()
  const edgeGeometry = React.useMemo(() => {
    return new THREE.BufferGeometry()
  }, [])

  React.useLayoutEffect(() => {
    syncLines(edgeGeometry, edges, highlight)
    applyEdgeIds(edgeGeometry)
    invalidate()
  }, [edgeGeometry, edges, highlight, invalidate])

  React.useEffect(() => {
    return () => {
      edgeGeometry.dispose()
      invalidate()
    }
  }, [edgeGeometry, invalidate])

  return edgeGeometry
}
