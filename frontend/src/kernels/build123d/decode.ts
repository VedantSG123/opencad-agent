import type {
  Build123dResult,
  EncodedBuffer,
  EncodedInstance,
  ShapeLocation,
  ShapeNode,
} from 'shared/build123d'

export type DecodedInstance = {
  vertices: Float32Array
  normals: Float32Array
  triangles: Uint32Array
  /** Line-segment endpoints, two points per segment. */
  edges: Float32Array
  objVertices: Float32Array
  faceTypes: Uint32Array
  edgeTypes: Uint32Array
  trianglesPerFace: Uint32Array
  segmentsPerEdge: Uint32Array
  uvs?: Float32Array
  /** Running triangle totals, one longer than `trianglesPerFace`. */
  faceOffsets: Uint32Array
  /** Running segment totals, one longer than `segmentsPerEdge`. */
  edgeOffsets: Uint32Array
}

/** A leaf of the assembly tree, with its location resolved to world space. */
export type DecodedPart = {
  id: string
  instanceRef: number
  name: string
  instance: DecodedInstance
  location: ShapeLocation
  color?: string
  alpha?: number
  visible: { faces: boolean; edges: boolean }
}

export type DecodedModel = {
  parts: DecodedPart[]
  tree: ShapeNode
  instances: DecodedInstance[]
}

function decodeBase64(encoded: string): ArrayBuffer {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * The runner casts every buffer before encoding, so a dtype that is not what
 * this expects means the two halves have drifted. Said rather than
 * reinterpreted: the bytes of a float64 array read as float32 are not an error
 * anywhere downstream, just a model that comes out as noise.
 */
function expectDtype(buffer: EncodedBuffer, dtype: EncodedBuffer['dtype']) {
  if (buffer.dtype !== dtype) {
    throw new Error(
      `Expected a ${dtype} buffer from the build123d runner, got ${buffer.dtype}`,
    )
  }
}

function toFloat32(buffer: EncodedBuffer): Float32Array {
  expectDtype(buffer, 'float32')
  return new Float32Array(decodeBase64(buffer.buffer))
}

function toUint32(buffer: EncodedBuffer): Uint32Array {
  expectDtype(buffer, 'uint32')
  return new Uint32Array(decodeBase64(buffer.buffer))
}

/**
 * Running totals of a per-entity count, with a leading zero.
 *
 * Picking starts from a triangle or a segment and has to name the BRep face or
 * edge that owns it, which is a search over these rather than a scan of the
 * counts themselves.
 */
function cumulative(counts: Uint32Array): Uint32Array {
  const offsets = new Uint32Array(counts.length + 1)
  for (let i = 0; i < counts.length; i++) {
    offsets[i + 1] = offsets[i] + counts[i]
  }
  return offsets
}

function decodeInstance(instance: EncodedInstance): DecodedInstance {
  const trianglesPerFace = toUint32(instance.triangles_per_face)
  const segmentsPerEdge = toUint32(instance.segments_per_edge)

  return {
    vertices: toFloat32(instance.vertices),
    normals: toFloat32(instance.normals),
    triangles: toUint32(instance.triangles),
    edges: toFloat32(instance.edges),
    objVertices: toFloat32(instance.obj_vertices),
    faceTypes: toUint32(instance.face_types),
    edgeTypes: toUint32(instance.edge_types),
    trianglesPerFace,
    segmentsPerEdge,
    uvs: instance.uvs ? toFloat32(instance.uvs) : undefined,
    faceOffsets: cumulative(trianglesPerFace),
    edgeOffsets: cumulative(segmentsPerEdge),
  }
}

const IDENTITY: ShapeLocation = [
  [0, 0, 0],
  [0, 0, 0, 1],
]

/**
 * Walk the tree to its leaves, carrying each node's location down.
 *
 * Locations compose down the tree, so a part nested two groups deep is drawn
 * where both of them put it. Only the leaves reference geometry.
 */
function collectParts(
  node: ShapeNode,
  instances: DecodedInstance[],
  parent: ShapeLocation,
  parts: DecodedPart[],
) {
  const location = composeLocation(parent, node.loc ?? IDENTITY)

  if (node.parts) {
    for (const child of node.parts) {
      collectParts(child, instances, location, parts)
    }
    return
  }

  const ref = node.shape?.ref
  if (ref === undefined || !instances[ref]) {
    return
  }

  parts.push({
    id: node.id,
    instanceRef: ref,
    name: node.name,
    instance: instances[ref],
    location,
    color: typeof node.color === 'string' ? node.color : undefined,
    alpha: node.alpha,
    visible: {
      faces: (node.state?.[0] ?? 1) === 1,
      edges: (node.state?.[1] ?? 1) === 1,
    },
  })
}

function composeLocation(
  parent: ShapeLocation,
  child: ShapeLocation,
): ShapeLocation {
  const [pp, pq] = parent
  const [cp, cq] = child

  const rotated = rotateByQuaternion(cp, pq)
  return [
    [pp[0] + rotated[0], pp[1] + rotated[1], pp[2] + rotated[2]],
    multiplyQuaternions(pq, cq),
  ]
}

export function rotateByQuaternion(
  point: [number, number, number],
  q: [number, number, number, number],
): [number, number, number] {
  const [x, y, z] = point
  const [qx, qy, qz, qw] = q

  // The standard v + 2q_w(q_v × v) + 2(q_v × (q_v × v)) expansion.
  const tx = 2 * (qy * z - qz * y)
  const ty = 2 * (qz * x - qx * z)
  const tz = 2 * (qx * y - qy * x)

  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx),
  ]
}

function multiplyQuaternions(
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

export function decodeModel(
  result: Extract<Build123dResult, { ok: true }>,
): DecodedModel {
  const instances = result.instances.map(decodeInstance)
  const parts: DecodedPart[] = []
  collectParts(result.shapes, instances, IDENTITY, parts)
  return { parts, tree: result.shapes, instances }
}
