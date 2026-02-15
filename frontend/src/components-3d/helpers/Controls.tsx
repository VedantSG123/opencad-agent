import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei';
import * as React from 'react';

const Controls: React.FC<ControlsProps> = ({
  hideGizmo = false,
  enableDamping = false,
}) => {
  return (
    <>
      <OrbitControls enableDamping={enableDamping} />
      {!hideGizmo && (
        <GizmoHelper alignment='bottom-right' margin={[80, 80]}>
          <GizmoViewport />
        </GizmoHelper>
      )}
    </>
  );
};

export default Controls;

type ControlsProps = {
  hideGizmo?: boolean;
  enableDamping?: boolean;
};
