import type { AnyShape, ShapeMesh } from 'replicad';
import {
  Blueprint,
  Blueprints,
  Compound,
  CompoundBlueprint,
  CompoundSketch,
  CompSolid,
  Drawing,
  Edge,
  EdgeFinder,
  Face,
  FaceFinder,
  Shell,
  Sketch,
  Sketches,
  Solid,
  Vertex,
  Wire,
} from 'replicad';

import type { LabelConfig, MeshRenderOutput, SvgRenderOutput } from '@/types';

import { normalizeColor } from './normalize-color';

function normalizeColorAndOpacity(inputShape: InputShape): InputShape {
  const { color, opacity, ...rest } = inputShape;

  if (color && !opacity) {
    const { color: normalizedColor, alpha } = normalizeColor(color);
    return {
      ...rest,
      color: normalizedColor,
      opacity: alpha,
    };
  }

  if (color && opacity) {
    const { color: normalizedColor } = normalizeColor(color);
    return {
      ...rest,
      color: normalizedColor,
      opacity,
    };
  }

  return inputShape;
}

function normalizeLabels(shape: InputShape): InputShape {
  const { labels, ...rest } = shape;
  const normalizedLabels: LabelConfig[] =
    labels?.map((label) => {
      const { from: fromInput, to: toInput, offset: offsetInput } = label;

      const from =
        fromInput instanceof Vertex ? fromInput.asTuple() : fromInput;
      const to = toInput instanceof Vertex ? toInput.asTuple() : toInput;
      const offset =
        offsetInput instanceof Vertex ? offsetInput.asTuple() : offsetInput;

      return {
        label: label.label || 'Label',
        from,
        to,
        offset,
        color: label.color,
        mode: label.mode,
        fontSize: label.fontSize,
        position: label.position,
      };
    }) || [];

  return {
    ...rest,
    labels: normalizedLabels,
  };
}

function normalizeHighlights(shape: InputShape): InputShape & {
  normalizedHighlights: NormalizedHighlight[];
} {
  const { highlight, highlightFace, highlightEdge, ...rest } = shape;
  const normalizedHighlights: NormalizedHighlight[] = [];

  if (highlight) {
    normalizedHighlights.push({
      find: (s: AnyShape) => highlight.find(s),
    });
  }

  if (highlightFace) {
    const finder = highlightFace(new FaceFinder());
    normalizedHighlights.push({
      find: (s: AnyShape) => finder.find(s),
    });
  }

  if (highlightEdge) {
    const finder = highlightEdge(new EdgeFinder());
    normalizedHighlights.push({
      find: (s: AnyShape) => finder.find(s),
    });
  }

  return {
    ...rest,
    normalizedHighlights,
  };
}

function createBaseInputShapesArray(
  shapes: unknown,
  baseName: string = 'Shape',
): Array<InputShape & { name: string }> {
  if (!Array.isArray(shapes)) {
    shapes = [shapes];
  }

  if (Array.isArray(shapes) && shapes.length !== 0) {
    return shapes
      .map((inputShape) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (!inputShape.shape) {
          return {
            shape: inputShape,
          } as InputShape;
        }

        return inputShape as InputShape;
      })
      .map((shape, index) => {
        const name = shape.name || `${baseName} ${index + 1}`;
        return {
          ...shape,
          name,
        };
      });
  }

  return [];
}

function adaptSketch(shape: unknown) {
  if (!(shape instanceof Sketch)) return shape;
  if (shape.wire.isClosed) return shape.face();
  return shape.wire;
}

function adaptSketches(shape: unknown) {
  const isSketches =
    shape instanceof Sketches || shape instanceof CompoundSketch;
  if (!isSketches) return shape;

  return shape.wires;
}

function getRenderSVGOutput(
  shapeConfig: SVGShapeConfiguration,
): SvgRenderOutput {
  const { name, shape, color, strokeType, opacity } = shapeConfig;
  return {
    name,
    color,
    strokeType,
    opacity,
    format: 'svg',
    paths: shape.toSVGPaths(),
    viewbox: shape.toSVGViewBox(),
  };
}

function getRenderMeshOutput(
  shapeConfig: MeshableConfiguration,
): MeshRenderOutput {
  const { name, shape, color, opacity, labels, highlights } = shapeConfig;
  const shapeInfo: MeshRenderOutput = {
    name,
    format: '3d',
    color,
    opacity,
    labels,
    mesh: null as ShapeMesh | null,
    edges: null as LineMesh | null,
    error: false,
    highlights: [] as number[],
  };

  try {
    const meshableShape = shape as unknown as MeshableShape;
    shapeInfo.mesh = meshableShape.mesh({
      tolerance: 0.1,
      angularTolerance: 30,
    });
    shapeInfo.edges = meshableShape.meshEdges({ keepMesh: true });
  } catch (e) {
    console.error(e);
    shapeInfo.error = true;
    return shapeInfo;
  }

  if (highlights) {
    try {
      const hashCodes = highlights
        .map((highlight) => {
          const found = highlight.find(shape);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          return found.map((f) => (f as any).hashCode as number);
        })
        .flatMap((x) => x);

      shapeInfo.highlights = hashCodes;
    } catch (e) {
      console.error(e);
    }
  }

  return shapeInfo;
}

export function getRenderOutput(
  shapes: unknown,
  onBeforeRender?: (cleanedShapes: CleanedShape[]) => void,
) {
  const inputShapes = createBaseInputShapesArray(shapes);

  const normalizedInputShapes = inputShapes
    .map(normalizeColorAndOpacity)
    .map(normalizeLabels)
    .map(normalizeHighlights);

  const adaptedShapes = normalizedInputShapes.map((shape) => {
    const adaptedShape = adaptSketch(shape.shape);
    const adaptedSketches = adaptSketches(adaptedShape);
    return {
      ...shape,
      shape: adaptedSketches,
    };
  });

  const standardShapes: CleanedShape[] = getStandardShapes(
    adaptedShapes as Array<
      InputShape & { name: string; normalizedHighlights: NormalizedHighlight[] }
    >,
  );

  const filteredShapes = standardShapes.filter(
    (shape) => isMeshShape(shape.shape) || isSvgShape(shape.shape),
  );

  if (onBeforeRender) {
    onBeforeRender(filteredShapes);
  }

  return filteredShapes
    .map((shape) => {
      if (isSvgShape(shape.shape)) {
        return getRenderSVGOutput({
          name: shape.name,
          shape: shape.shape,
          color: shape.color,
          opacity: shape.opacity,
          strokeType: shape.strokeType,
        });
      }

      if (isMeshShape(shape.shape)) {
        return getRenderMeshOutput({
          name: shape.name,
          shape: shape.shape as AnyShape,
          color: shape.color,
          opacity: shape.opacity,
          labels: shape.labels,
          highlights: shape.highlights,
        });
      }

      return null;
    })
    .filter(Boolean) as Array<SvgRenderOutput> | Array<MeshRenderOutput>;
}

function getStandardShapes(
  adaptedShapes: Array<
    InputShape & { name: string; normalizedHighlights: NormalizedHighlight[] }
  >,
): CleanedShape[] {
  return adaptedShapes
    .filter((shape) => isMeshShape(shape.shape) || isSvgShape(shape.shape))
    .map((shape) => ({
      name: shape.name,
      shape: shape.shape as AnyShape | AnyDrawing,
      highlights: shape.normalizedHighlights,
      labels: shape.labels || [],
      color: shape.color,
      opacity: shape.opacity,
      strokeType: shape.strokeType,
    }));
}

function isSvgShape(shape: unknown): shape is AnyDrawing {
  return (
    shape instanceof Blueprint ||
    shape instanceof Blueprints ||
    shape instanceof CompoundBlueprint ||
    shape instanceof Drawing ||
    (typeof shape === 'object' &&
      shape !== null &&
      'toSVGPaths' in shape &&
      'toSVGViewBox' in shape &&
      typeof (shape as Record<string, unknown>).toSVGPaths === 'function' &&
      typeof (shape as Record<string, unknown>).toSVGViewBox === 'function')
  );
}

export function isMeshShape(shape: unknown): shape is AnyShape {
  return (
    (shape instanceof Vertex ||
      shape instanceof Edge ||
      shape instanceof Wire ||
      shape instanceof Face ||
      shape instanceof Shell ||
      shape instanceof Solid ||
      shape instanceof CompSolid ||
      shape instanceof Compound) &&
    typeof shape === 'object' &&
    shape !== null &&
    'mesh' in shape &&
    'meshEdges' in shape &&
    // Type check for MeshFunction - should return ShapeMesh
    (() => {
      try {
        const meshFn = (shape as Record<string, unknown>).mesh as MeshFunction;
        return typeof meshFn === 'function';
      } catch {
        return false;
      }
    })() &&
    // Type check for MeshEdgesFunction - should return LineMesh
    (() => {
      try {
        const meshEdgesFn = (shape as Record<string, unknown>)
          .meshEdges as MeshEdgesFunction;
        return typeof meshEdgesFn === 'function';
      } catch {
        return false;
      }
    })()
  );
}

type AnyDrawing = Blueprint | Blueprints | CompoundBlueprint | Drawing;

type InputShape = {
  shape: unknown;
  name?: string;
  color?: string;
  opacity?: number;
  strokeType?: string;
  labels?: LabelConfig[];
  highlight?: FaceFinder | EdgeFinder;
  highlightFace?: (finder: FaceFinder) => FaceFinder;
  highlightEdge?: (finder: EdgeFinder) => EdgeFinder;
};

export type CleanedShape = {
  name: string;
  shape: AnyShape | AnyDrawing;
  highlights: NormalizedHighlight[];
  labels: LabelConfig[];
  color?: string;
  opacity?: number;
  strokeType?: string;
};

type SVGShapeConfiguration = {
  name: string;
  shape: AnyDrawing;
  color?: string;
  opacity?: number;
  strokeType?: string;
};

type MeshableConfiguration = {
  name: string;
  shape: AnyShape;
  color?: string;
  opacity?: number;
  highlights: NormalizedHighlight[];
  labels: LabelConfig[];
};

type NormalizedHighlight = {
  find: (shape: AnyShape) => Face[] | Edge[];
};

type LineMesh = {
  lines: number[];
  edgeGroups: {
    start: number;
    count: number;
    edgeId: number;
  }[];
};

type MeshFunction = (params?: {
  tolerance?: number;
  angularTolerance?: number;
}) => ShapeMesh;

type MeshEdgesFunction = (params?: {
  tolerance?: number;
  angularTolerance?: number;
  keepMesh?: boolean;
}) => LineMesh;

// Interface to properly type shapes with mesh capabilities
export interface MeshableShape {
  mesh(params?: { tolerance?: number; angularTolerance?: number }): ShapeMesh;
  meshEdges(params?: {
    tolerance?: number;
    angularTolerance?: number;
    keepMesh?: boolean;
  }): LineMesh;
}
