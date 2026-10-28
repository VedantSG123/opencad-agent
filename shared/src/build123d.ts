/**
 * What the build123d runner hands back.
 *
 * Plain types rather than zod schemas, unlike the rest of this package: a
 * payload is a handful of base64 buffers that run to megabytes on a real model,
 * and parsing one through a validator would copy every byte of it to learn what
 * the producer on the other end of the pipe already guarantees.
 */

export type EncodedBuffer = {
  shape: number[]
  dtype: 'float32' | 'int32' | 'uint32'
  buffer: string
  codec: 'b64'
}

/**
 * One tessellated shape.
 *
 * Every buffer is optional because not every shape has one: an edge-only
 * object - a Line or a Wire - carries edges and nothing else, and arrives
 * inline on its node rather than in the instance list.
 */
export type EncodedInstance = {
  vertices?: EncodedBuffer
  normals?: EncodedBuffer
  /** Flat triangle indices, three per triangle. */
  triangles?: EncodedBuffer
  /** Line-segment endpoints, already two points per segment. */
  edges?: EncodedBuffer
  obj_vertices?: EncodedBuffer
  face_types?: EncodedBuffer
  edge_types?: EncodedBuffer
  /** Triangle count per BRep face, which is where the face groups come from. */
  triangles_per_face?: EncodedBuffer
  /** Segment count per BRep edge, likewise for the edge groups. */
  segments_per_edge?: EncodedBuffer
  uvs?: EncodedBuffer
}

/** Position and quaternion, as ocp_tessellate writes a location. */
export type ShapeLocation = [
  [number, number, number],
  [number, number, number, number],
]

export type BoundingBox = {
  xmin: number
  xmax: number
  ymin: number
  ymax: number
  zmin: number
  zmax: number
}

/** A node of the assembly tree: either a group with `parts` or a leaf with `shape`. */
export type ShapeNode = {
  name: string
  id: string
  loc?: ShapeLocation | null
  parts?: ShapeNode[]
  shape?: { ref: number } | EncodedInstance | null
  /**
   * Visibility as [faces, edges], where 3 means the shape has no component
   * of that kind at all rather than one that is switched off.
   */
  state?: [number, number]
  type?: string
  subtype?: string
  color?: string | string[]
  alpha?: number
  /** Draw the far side too. Set for an open shape - a face or a sketch. */
  renderback?: boolean
  bb?: BoundingBox | null
}

export type Build123dResult =
  | {
      ok: true
      instances: EncodedInstance[]
      shapes: ShapeNode
      logs: string
      duration: number
    }
  | { ok: false; error: string; logs: string; duration: number }

export type Build123dRunIdentity = {
  sessionId: string
  runId: string
}

export type Build123dProjectRequest = Build123dRunIdentity & {
  mainPath: string
  projectDirectory: string
  overrides?: Record<string, string>
}

export type Build123dSourceRequest = Build123dRunIdentity & { source: string }

export type Build123dCancelRequest = {
  sessionId: string
  runId?: string
}

/**
 * The 3D formats offered from the viewport.
 *
 * STEP leads because it is the only one that keeps exact geometry and the
 * assembly - labels and all - so it is what goes to a machinist or into
 * another CAD package. The rest are meshes: STL for printing, 3MF for printing
 * with colour and a fraction of STL's size, GLB for the web.
 *
 * OBJ and BREP are deliberately absent. OBJ writes no .mtl, so its materials
 * do not travel, and BREP is only readable by another OpenCascade program.
 */
export const BUILD123D_EXPORT_FORMATS = [
  'step',
  'stl',
  'stl-ascii',
  '3mf',
  'glb',
] as const

export type Build123dExportFormat = (typeof BUILD123D_EXPORT_FORMATS)[number]

/** The extension each format is written with; both STL variants are .stl. */
export const BUILD123D_EXPORT_EXTENSIONS: Record<
  Build123dExportFormat,
  string
> = {
  step: 'step',
  stl: 'stl',
  'stl-ascii': 'stl',
  '3mf': '3mf',
  glb: 'glb',
}

export type Build123dExportResult =
  | {
      ok: true
      /** The written file, read back off disk. */
      data: Uint8Array
      extension: string
      logs: string
      duration: number
    }
  | { ok: false; error: string; logs: string; duration: number }
