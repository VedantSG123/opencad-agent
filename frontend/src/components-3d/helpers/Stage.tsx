import type { ThreeElements } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import * as React from 'react';
import * as THREE from 'three';

export default function Stage({
  children,
  center = false,
  ...props
}: StageProps) {
  const camera = useThree((state) => state.camera);
  const { invalidate } = useThree();
  const outer = React.useRef<THREE.Group>(null);
  const inner = React.useRef<THREE.Group>(null);

  const [{ radius, previousRadius, top }, set] = React.useState<StageState>({
    previousRadius: null,
    radius: 0,
    top: 0,
  });

  // Measure bounding box and sphere whenever children change
  React.useLayoutEffect(() => {
    if (!outer.current || !inner.current) return;

    outer.current.updateWorldMatrix(true, true);
    const box3 = new THREE.Box3().setFromObject(inner.current);

    if (center) {
      const centerPoint = new THREE.Vector3();
      box3.getCenter(centerPoint);
      outer.current.position.set(
        outer.current.position.x - centerPoint.x,
        outer.current.position.y - centerPoint.y,
        outer.current.position.z - centerPoint.z,
      );
    }

    const sphere = new THREE.Sphere();
    box3.getBoundingSphere(sphere);

    set({ radius: sphere.radius, previousRadius: radius, top: box3.max.z });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  // Adjust camera based on bounding sphere size
  React.useLayoutEffect(() => {
    if (!camera || !radius) return;

    if (previousRadius && previousRadius !== radius) {
      const ratio = radius / previousRadius;
      camera.position.set(
        camera.position.x * ratio,
        camera.position.y * ratio,
        camera.position.z * ratio,
      );
      camera.far = Math.max(5000, radius * 4);
      invalidate();
      return;
    }

    // Perspective camera default
    camera.position.set(
      radius * 0.25,
      -radius * 1.5,
      Math.max(top, radius) * 1.5,
    );
    camera.near = 0.1;
    camera.far = Math.max(5000, radius * 4);
    camera.lookAt(0, 0, 0);

    if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
      const orthoCam = camera as THREE.OrthographicCamera;
      orthoCam.position.set(radius, -radius, radius);
      orthoCam.zoom = 5;
      orthoCam.near = -Math.max(5000, radius * 4);
      orthoCam.updateProjectionMatrix();
    }

    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius, top, previousRadius]);

  return (
    <group {...props}>
      <group ref={outer}>
        <group ref={inner}>{children}</group>
      </group>
    </group>
  );
}

type StageProps = ThreeElements['group'] & {
  /** If true, centers children to world origin */
  center?: boolean;
  /** 3D content */
  children: React.ReactNode;
};

type StageState = {
  previousRadius: number | null;
  radius: number;
  top: number;
};
