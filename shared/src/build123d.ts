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

/** One tessellated solid. Parts reference these by index. */
export type EncodedInstance = {
  vertices: EncodedBuffer
  normals: EncodedBuffer
  /** Flat triangle indices, three per triangle. */
  triangles: EncodedBuffer
  /** Line-segment endpoints, already two points per segment. */
  edges: EncodedBuffer
  obj_vertices: EncodedBuffer
  face_types: EncodedBuffer
  edge_types: EncodedBuffer
  /** Triangle count per BRep face, which is where the face groups come from. */
  triangles_per_face: EncodedBuffer
  /** Segment count per BRep edge, likewise for the edge groups. */
  segments_per_edge: EncodedBuffer
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
  shape?: { ref: number } | null
  /** Visibility as [faces, edges]. */
  state?: [number, number]
  type?: string
  subtype?: string
  color?: string | string[]
  alpha?: number
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
