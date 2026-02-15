import { useThree } from '@react-three/fiber';
import * as React from 'react';
import type { ReplicadMeshedEdges } from 'replicad-threejs-helper';
import { syncLines } from 'replicad-threejs-helper';
import * as THREE from 'three';

export const useReplicadEdgeGeometry = (
  edges: ReplicadMeshedEdges,
  highlight: number[],
) => {
  const { invalidate } = useThree();
  const edgeGeometry = React.useMemo(() => {
    return new THREE.BufferGeometry();
  }, []);

  React.useLayoutEffect(() => {
    syncLines(edgeGeometry, edges, highlight);
    invalidate();
  }, [edgeGeometry, edges, highlight, invalidate]);

  React.useEffect(() => {
    return () => {
      edgeGeometry.dispose();
      invalidate();
    };
  }, [edgeGeometry, invalidate]);

  return edgeGeometry;
};
