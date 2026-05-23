import type { ThreeEvent } from '@react-three/fiber'
import * as React from 'react'
import { getEdgeIndex } from 'replicad-threejs-helper'
import type * as THREE from 'three'

export const getEdgeIndexFromEvent = (
  event: ThreeEvent<MouseEvent>,
): number => {
  const lineSegments = event.object as THREE.LineSegments
  return getEdgeIndex(event.index!, lineSegments.geometry)
}

export function useEdgeEvent(
  onEvent?: ((e: ThreeEvent<MouseEvent>, edgeIndex: number) => void) | null,
) {
  return React.useMemo(() => {
    if (!onEvent) return undefined
    return (e: ThreeEvent<MouseEvent>) => {
      onEvent(e, getEdgeIndexFromEvent(e))
    }
  }, [onEvent])
}
