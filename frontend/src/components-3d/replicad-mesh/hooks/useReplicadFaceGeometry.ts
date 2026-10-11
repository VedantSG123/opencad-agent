import { useThree } from '@react-three/fiber'
import * as React from 'react'
import type { ReplicadMeshedFaces } from 'replicad-threejs-helper'
import { syncFaces } from 'replicad-threejs-helper'
import * as THREE from 'three'

import { COMPONENT_ID_ATTRIBUTE } from '../../highlight/state'

type FaceGroup = { start: number; count: number; faceId: number }

/**
 * Copy replicad's draw groups onto the vertices as ids.
 *
 * The id is the group's position in the list, not its `faceId`: that is the
 * space `getFaceIndex` reports and highlights arrive in. The groups themselves
 * stay - three.js only walks them when a mesh holds an array of materials, so
 * with one material they cost nothing and picking still reads them.
 */
function applyFaceIds(geometry: THREE.BufferGeometry) {
  const groups = geometry.userData.faceGroups as FaceGroup[] | undefined
  const index = geometry.getIndex()
  const position = geometry.getAttribute('position')
  if (!groups || !index || !position) return

  const ids = new Float32Array(position.count)
  groups.forEach(({ start, count }, group) => {
    for (let i = start; i < start + count; i++) {
      ids[index.getX(i)] = group
    }
  })

  geometry.setAttribute(
    COMPONENT_ID_ATTRIBUTE,
    new THREE.BufferAttribute(ids, 1),
  )
}

export const useReplicadFaceGeometry = (
  faces: ReplicadMeshedFaces,
  highlight: number[],
) => {
  const { invalidate } = useThree()
  const faceGeometry = React.useMemo(() => new THREE.BufferGeometry(), [])

  React.useLayoutEffect(() => {
    syncFaces(faceGeometry, faces, highlight)
    applyFaceIds(faceGeometry)
    invalidate()
  }, [faceGeometry, faces, highlight, invalidate])

  React.useEffect(() => {
    return () => {
      faceGeometry.dispose()
      invalidate()
    }
  }, [faceGeometry, invalidate])

  return faceGeometry
}
