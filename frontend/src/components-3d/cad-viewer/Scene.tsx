import * as React from 'react';

import Controls from '../helpers/Controls';
import Stage from '../helpers/Stage';
import { InfiniteGrid } from './InfiniteGrid';

export const Scene: React.FC<SceneProps> = ({
  children,
  hideGizmo = false,
  enableDamping = false,
  center,
}) => {
  return (
    <>
      <Controls hideGizmo={hideGizmo} enableDamping={enableDamping} />
      <Stage center={center}>{children}</Stage>
      <InfiniteGrid />
    </>
  );
};

type SceneProps = {
  hideGizmo?: boolean;
  enableDamping?: boolean;
  center?: boolean;
  children: React.ReactNode;
};
