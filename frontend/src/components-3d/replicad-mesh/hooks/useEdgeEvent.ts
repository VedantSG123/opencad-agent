import type { ThreeEvent } from '@react-three/fiber';
import * as React from 'react';
import { getEdgeIndex } from 'replicad-threejs-helper';
import * as THREE from 'three';

export function useEdgeEvent(onClick: (edgeIndex: number) => void) {
  const handleEdgeClick = React.useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!e.index || !(e.object instanceof THREE.LineSegments)) {
        return;
      }
      const edgeIndex = getEdgeIndex(
        e.index,
        e.object.geometry as THREE.BufferGeometry,
      );
      onClick(edgeIndex);
    },
    [onClick],
  );

  return {
    handleEdgeClick,
  };
}
