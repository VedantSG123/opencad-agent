import { useTexture } from '@react-three/drei';
import type { ThreeElements } from '@react-three/fiber';
import type * as React from 'react';
import type { ReplicadMeshedFaces } from 'replicad-threejs-helper';

import { useApplyHighlights } from './hooks/useApplyHighlights';
import { useReplicadFaceGeometry } from './hooks/useReplicadFaceGeometry';
import getMeshColors from './meshColors';

export const ReplicadFacesMesh: React.FC<ReplicadFacesMeshProps> = ({
  faces,
  defaultHighlights,
  highlights = [],
  opacity,
  color,
  ...rest
}) => {
  const geometry = useReplicadFaceGeometry(faces, defaultHighlights || []);
  useApplyHighlights(geometry, highlights);

  const matcapTexture = useTexture('matcap-main.png');

  const transparent = opacity !== undefined && opacity < 1;

  const meshColors = getMeshColors(color);

  return (
    <mesh {...rest}>
      <primitive attach='geometry' object={geometry} />
      <meshMatcapMaterial
        attach={'material-0'}
        transparent={transparent}
        matcap={matcapTexture}
        opacity={opacity}
        color={meshColors.base}
        polygonOffset
        polygonOffsetFactor={2.0}
        polygonOffsetUnits={1.0}
      />
      <meshMatcapMaterial
        attach={'material-1'}
        transparent={transparent}
        matcap={matcapTexture}
        opacity={opacity}
        color={meshColors.selected}
        polygonOffset
        polygonOffsetFactor={2.0}
        polygonOffsetUnits={1.0}
      />
    </mesh>
  );
};

useTexture.preload('matcap-main.png');

type ReplicadFacesMeshProps = ThreeElements['mesh'] & {
  faces: ReplicadMeshedFaces;
  defaultHighlights?: number[];
  highlights?: number[];
  opacity?: number;
  color?: string;
};
