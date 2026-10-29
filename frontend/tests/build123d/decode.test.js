import { describe, expect, test } from 'bun:test'

import { decodeModel } from '../../src/kernels/build123d/decode'

function encoded(values, dtype = 'float32') {
  const array =
    dtype === 'float32' ? new Float32Array(values) : new Uint32Array(values)
  return {
    shape: [array.length],
    dtype,
    codec: 'b64',
    buffer: Buffer.from(array.buffer).toString('base64'),
  }
}

function model() {
  return {
    ok: true,
    logs: '',
    duration: 0,
    instances: [
      {
        vertices: encoded([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        normals: encoded([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        triangles: encoded([0, 1, 2], 'uint32'),
        edges: encoded([0, 0, 0, 1, 0, 0]),
        obj_vertices: encoded([0, 0, 0]),
        face_types: encoded([0], 'uint32'),
        edge_types: encoded([0], 'uint32'),
        triangles_per_face: encoded([1], 'uint32'),
        segments_per_edge: encoded([1], 'uint32'),
      },
    ],
    shapes: {
      id: 'root',
      name: 'assembly',
      parts: [
        {
          id: 'part',
          name: 'triangle',
          shape: { ref: 0 },
          state: [1, 1],
          loc: [
            [2, 3, 4],
            [0, 0, 0, 1],
          ],
        },
      ],
    },
  }
}

describe('build123d geometry decoding', () => {
  test('decodes geometry and CAD entity ranges for a transformed part', () => {
    const decoded = decodeModel(model())
    expect(Array.from(decoded.instances[0].vertices)).toEqual([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
    ])
    expect(Array.from(decoded.instances[0].faceOffsets)).toEqual([0, 1])
    expect(Array.from(decoded.instances[0].edgeOffsets)).toEqual([0, 1])
    expect(decoded.parts[0].location).toEqual([
      [2, 3, 4],
      [0, 0, 0, 1],
    ])
    expect(decoded.parts[0].visible).toEqual({ faces: true, edges: true })
  })

  for (const field of ['vertices', 'normals', 'edges', 'obj_vertices', 'uvs']) {
    test(`rejects non-finite ${field} before rendering`, () => {
      const result = model()
      result.instances[0][field] = encoded([NaN, Infinity, -Infinity])
      expect(() => decodeModel(result)).toThrow(
        `instances[0].${field} contains a non-finite value`,
      )
    })
  }

  for (const [field, values, message] of [
    ['vertices', [0, 0], 'vertices must contain complete 3-component vectors'],
    ['normals', [0, 0], 'normals must contain complete 3-component vectors'],
    [
      'obj_vertices',
      [0],
      'obj_vertices must contain complete 3-component vectors',
    ],
    ['edges', [0, 0, 0], 'edges must contain complete line segments'],
  ]) {
    test(`rejects incomplete ${field}`, () => {
      const result = model()
      result.instances[0][field] = encoded(values)
      expect(() => decodeModel(result)).toThrow(message)
    })
  }

  test('rejects a triangle index outside the vertex buffer', () => {
    const result = model()
    result.instances[0].triangles = encoded([0, 1, 3], 'uint32')
    expect(() => decodeModel(result)).toThrow(
      'instances[0].triangles references vertex 3, but only 3 vertices exist',
    )
  })

  test('rejects an incomplete triangle', () => {
    const result = model()
    result.instances[0].triangles = encoded([0, 1], 'uint32')
    expect(() => decodeModel(result)).toThrow(
      'triangles must contain complete triangles',
    )
  })

  test('requires one normal for each mesh vertex', () => {
    const result = model()
    result.instances[0].normals = encoded([0, 0, 1])
    expect(() => decodeModel(result)).toThrow(
      'normals must match the vertex count',
    )
    delete result.instances[0].normals
    expect(() => decodeModel(result)).toThrow(
      'normals must match the vertex count',
    )
  })

  test('requires UV coordinates for every vertex when UV data is present', () => {
    const result = model()
    result.instances[0].uvs = encoded([0, 0, 1, 1])
    expect(() => decodeModel(result)).toThrow(
      'uvs must contain two coordinates per vertex',
    )
    result.instances[0].uvs = encoded([0, 0, 1, 0, 0, 1])
    expect(Array.from(decodeModel(result).instances[0].uvs)).toEqual([
      0, 0, 1, 0, 0, 1,
    ])
  })

  test('treats an empty optional UV buffer as absent', () => {
    const result = model()
    result.instances[0].uvs = encoded([])
    expect(decodeModel(result).instances[0].uvs).toBeUndefined()
  })

  for (const [field, values, message] of [
    [
      'triangles_per_face',
      [2],
      'triangles_per_face totals do not match the triangle count',
    ],
    ['face_types', [0, 1], 'face_types must match triangles_per_face'],
    [
      'segments_per_edge',
      [2],
      'segments_per_edge totals do not match the line segment count',
    ],
    ['edge_types', [0, 1], 'edge_types must match segments_per_edge'],
  ]) {
    test(`rejects inconsistent ${field}`, () => {
      const result = model()
      result.instances[0][field] = encoded(values, 'uint32')
      expect(() => decodeModel(result)).toThrow(message)
    })
  }

  test('rejects cumulative entity counts that overflow Uint32 offsets', () => {
    const result = model()
    result.instances[0].triangles_per_face = encoded([0xffffffff, 1], 'uint32')
    result.instances[0].face_types = encoded([0, 0], 'uint32')
    expect(() => decodeModel(result)).toThrow(
      'triangles_per_face totals exceed the Uint32 range',
    )
  })

  test('rejects a missing instance reference instead of silently hiding the part', () => {
    const result = model()
    result.shapes.parts[0].shape.ref = 9
    expect(() => decodeModel(result)).toThrow(
      'Shape part refers to missing instance 9',
    )
  })

  test('rejects a composed transform that overflows despite finite input locations', () => {
    const result = model()
    result.shapes.loc = [
      [Number.MAX_VALUE, 0, 0],
      [0, 0, 0, 1],
    ]
    result.shapes.parts[0].loc = [
      [Number.MAX_VALUE, 0, 0],
      [0, 0, 0, 1],
    ]
    expect(() => decodeModel(result)).toThrow(
      'Shape part location contains a non-finite value',
    )
  })

  test('accepts inline edge and vertex geometry and an empty assembly', () => {
    const result = model()
    result.instances = []
    result.shapes.parts = [
      {
        id: 'line',
        name: 'line',
        loc: null,
        shape: {
          edges: encoded([0, 0, 0, 1, 0, 0]),
          segments_per_edge: encoded([1], 'uint32'),
          edge_types: encoded([0], 'uint32'),
        },
      },
      {
        id: 'point',
        name: 'point',
        shape: { obj_vertices: encoded([1, 2, 3]) },
      },
    ]
    expect(
      decodeModel(result).parts.map((part) => ({
        name: part.name,
        visible: part.visible,
      })),
    ).toEqual([
      { name: 'line', visible: { faces: false, edges: true } },
      { name: 'point', visible: { faces: false, edges: false } },
    ])
    result.shapes.parts = []
    expect(decodeModel(result).parts).toEqual([])
  })
})
