import { useThree } from '@react-three/fiber';
import * as React from 'react';
import type { ReplicadMeshedFaces } from 'replicad-threejs-helper';
import { syncFaces } from 'replicad-threejs-helper';
import * as THREE from 'three';

export const useReplicadFaceGeometry = (
  faces: ReplicadMeshedFaces,
  highlight: number[],
) => {
  const { invalidate } = useThree();
  const faceGeometry = React.useMemo(() => new THREE.BufferGeometry(), []);

  React.useLayoutEffect(() => {
    syncFaces(faceGeometry, faces, highlight);
    invalidate();
  }, [faceGeometry, faces, highlight, invalidate]);

  React.useEffect(() => {
    return () => {
      faceGeometry.dispose();
      invalidate();
    };
  }, [faceGeometry, invalidate]);

  return faceGeometry;
};
