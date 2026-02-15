import { useThree } from '@react-three/fiber';
import * as React from 'react';
import { highlightInGeometry } from 'replicad-threejs-helper';
import type * as THREE from 'three';

export const useApplyHighlights = (
  geometry: THREE.BufferGeometry,
  highlights: number[],
) => {
  const { invalidate } = useThree();

  React.useLayoutEffect(() => {
    // @ts-expect-error replicad-threejs-helper module lacks proper TypeScript definitions
    highlightInGeometry(highlights, geometry);
    invalidate();
  }, [geometry, highlights, invalidate]);
};
