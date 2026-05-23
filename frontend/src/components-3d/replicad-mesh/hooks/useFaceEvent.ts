import type { ThreeEvent } from '@react-three/fiber'
import * as React from 'react'
import { getFaceIndex } from 'replicad-threejs-helper'
import type * as THREE from 'three'

export const getFaceIndexFromEvent = (
  event: ThreeEvent<MouseEvent>,
): number => {
  const mesh = event.object as THREE.Mesh
  return getFaceIndex(event.faceIndex!, mesh.geometry)
}

export function useFaceEvent(
  onEvent?: ((e: ThreeEvent<MouseEvent>, faceIndex: number) => void) | null,
) {
  return React.useMemo(() => {
    if (!onEvent) return undefined
    return (e: ThreeEvent<MouseEvent>) => {
      onEvent(e, getFaceIndexFromEvent(e))
    }
  }, [onEvent])
}
