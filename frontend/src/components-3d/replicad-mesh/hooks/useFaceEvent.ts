import type { ThreeEvent } from '@react-three/fiber';
import * as React from 'react';
import { getFaceIndex } from 'replicad-threejs-helper';
import * as THREE from 'three';

export function useFaceEvent(onClick: (faceIndex: number) => void) {
  const handleFaceClick = React.useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!e.index || !(e.object instanceof THREE.Mesh)) {
        return;
      }
      const faceIndex = getFaceIndex(
        e.index,
        e.object.geometry as THREE.BufferGeometry,
      );
      onClick(faceIndex);
    },
    [onClick],
  );

  return {
    handleFaceClick,
  };
}
