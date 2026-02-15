import type {
  ReplicadMeshedEdges,
  ReplicadMeshedFaces,
} from 'replicad-threejs-helper';

type BaseRenderOutput = {
  name: string;
  format: RenderFormat;
  color?: string;
  opacity?: number;
};

export type SvgRenderOutput = BaseRenderOutput & {
  format: 'svg';
  strokeType?: string;
  paths: string[] | string[][];
  viewbox: string;
};

export type MeshRenderOutput = BaseRenderOutput & {
  format: '3d';
  mesh: ReplicadMeshedFaces | null;
  edges: ReplicadMeshedEdges | null;
  labels?: LabelConfig[];
  error: boolean;
  highlights?: number[];
};

export type RenderFormat = 'svg' | '3d';

export type LabelConfig = {
  label: string;
  from: [number, number, number];
  to: [number, number, number];
  offset?: [number, number, number];
  color?: string;
  mode?: 'length' | 'point';
  fontSize?: number;
  position?: 'auto' | 'side' | 'top' | 'bottom';
};

export type ExportFileTypes = 'step' | 'step-assembly' | 'stl' | 'stl-binary';

export type ExportConfiguration = {
  tolerance?: number;
  angularTolerance?: number;
};
