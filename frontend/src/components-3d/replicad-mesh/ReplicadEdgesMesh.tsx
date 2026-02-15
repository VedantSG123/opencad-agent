import type { ThreeElements } from '@react-three/fiber';
import type * as React from 'react';
import type { ReplicadMeshedEdges } from 'replicad-threejs-helper';

import { useApplyHighlights } from './hooks/useApplyHighlights';
import { useReplicadEdgeGeometry } from './hooks/useReplicadEdgeGeometry';
import getMeshColors from './meshColors';

export const ReplicadEdgesMesh: React.FC<ReplicadEdgesMeshProps> = ({
  edges,
  defaultHighlights,
  highlights = [],
  opacity,
  color,
  ...rest
}) => {
  const geometry = useReplicadEdgeGeometry(edges, defaultHighlights || []);
  useApplyHighlights(geometry, highlights);

  const transparent = opacity !== undefined && opacity < 1;

  const meshColors = getMeshColors(color);

  return (
    <lineSegments {...rest}>
      <primitive attach='geometry' object={geometry} />
      <lineBasicMaterial
        attach={'material-0'}
        transparent={transparent}
        opacity={opacity}
        color={meshColors.line}
        polygonOffset
        polygonOffsetFactor={2.0}
        polygonOffsetUnits={1.0}
      />
      <lineBasicMaterial
        attach={'material-1'}
        transparent={transparent}
        opacity={opacity}
        color={meshColors.lineSelected}
        polygonOffset
        polygonOffsetFactor={2.0}
        polygonOffsetUnits={1.0}
      />
    </lineSegments>
  );
};

type ReplicadEdgesMeshProps = ThreeElements['lineSegments'] & {
  edges: ReplicadMeshedEdges;
  defaultHighlights?: number[];
  highlights?: number[];
  opacity?: number;
  color?: string;
};
