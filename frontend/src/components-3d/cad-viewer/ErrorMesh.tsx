import { MeshDistortMaterial, Sphere } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as React from 'react';
import * as THREE from 'three';

export function ErrorMesh() {
  const camera = useThree((state) => state.camera);
  const set = useThree((state) => state.set);
  const frameloop = useThree((state) => state.frameloop);
  const originalFrameloop = React.useRef<typeof frameloop>(frameloop);

  const lightRef = React.useRef<THREE.DirectionalLight>(null);

  React.useLayoutEffect(() => {
    if (originalFrameloop.current !== 'demand') return;
    set({ frameloop: 'always' });
    return () => set({ frameloop: 'demand' });
  }, [set]);

  useFrame(() => {
    if (lightRef.current) {
      lightRef.current.position.copy(camera.position);
    }
  });

  return (
    <group>
      <ambientLight intensity={0.5} />
      <directionalLight ref={lightRef} intensity={1} />

      <Sphere scale={100} args={[1, 32, 32]}>
        <MeshDistortMaterial
          color='#5a8296'
          speed={3}
          distort={0.6}
          radius={1}
          side={THREE.BackSide}
        />
      </Sphere>
    </group>
  );
}
