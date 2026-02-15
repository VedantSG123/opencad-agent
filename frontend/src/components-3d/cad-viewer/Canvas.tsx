import type { CanvasProps } from '@react-three/fiber';
import { Canvas as R3FCanvas } from '@react-three/fiber';
import * as React from 'react';

export const Canvas: React.FC<CanvasProps> = ({ children, ...rest }) => {
  const dpr = Math.min(2, window.devicePixelRatio);
  return (
    <React.Suspense fallback={null}>
      <R3FCanvas dpr={dpr} frameloop='demand' {...rest}>
        {children}
      </R3FCanvas>
    </React.Suspense>
  );
};
