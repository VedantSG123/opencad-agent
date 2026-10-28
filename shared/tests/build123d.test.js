import { describe, expect, test } from 'bun:test'

import {
  parseBuild123dExportReport,
  parseBuild123dResult,
} from '../src/build123d'

function buffer(values, dtype = 'float32', shape = [values.length]) {
  const array =
    dtype === 'float32' ? new Float32Array(values) : new Uint32Array(values)
  return {
    shape,
    dtype,
    codec: 'b64',
    buffer: Buffer.from(array.buffer).toString('base64'),
  }
}

function preview() {
  return {
    ok: true,
    logs: 'built model',
    duration: 0.25,
    instances: [
      {
        vertices: buffer([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        normals: buffer([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        triangles: buffer([0, 1, 2], 'uint32'),
        triangles_per_face: buffer([1], 'uint32'),
        face_types: buffer([0], 'uint32'),
        edges: buffer([0, 0, 0, 1, 0, 0], 'float32', [2, 3]),
        segments_per_edge: buffer([1], 'uint32'),
        edge_types: buffer([0], 'uint32'),
      },
    ],
    shapes: {
      name: 'Assembly',
      id: '/assembly',
      parts: [
        {
          name: 'Triangle',
          id: '/assembly/triangle',
          shape: { ref: 0 },
          state: [1, 1],
        },
      ],
    },
  }
}

describe('build123d preview protocol', () => {
  test('accepts mesh data and strips producer fields the app does not consume', () => {
    const value = preview()
    value.shapes.version = 3
    value.shapes.parts[0].material = null
    const parsed = parseBuild123dResult(value)
    expect(parsed.instances[0].edges.shape).toEqual([2, 3])
    expect(parsed.shapes.parts[0].shape).toEqual({ ref: 0 })
    expect(parsed.shapes.version).toBeUndefined()
    expect(parsed.logs).toBe('built model')
  })

  test('accepts empty groups, reused instances, inline wires and inline vertices', () => {
    const value = preview()
    value.shapes.parts.push({
      name: 'Other triangle',
      id: '/assembly/other',
      shape: { ref: 0 },
    })
    value.shapes.parts.push({
      name: 'Wire',
      id: '/assembly/wire',
      loc: null,
      state: [3, 1],
      shape: {
        edges: buffer([0, 0, 0, 1, 0, 0]),
        segments_per_edge: buffer([1], 'uint32'),
        edge_types: buffer([0], 'uint32'),
      },
    })
    value.shapes.parts.push({
      name: 'Vertex',
      id: '/assembly/vertex',
      shape: { obj_vertices: buffer([1, 2, 3]) },
    })
    value.instances[0].uvs = buffer([])
    expect(parseBuild123dResult(value).shapes.parts).toHaveLength(4)
    expect(
      parseBuild123dResult({
        ...value,
        instances: [],
        shapes: { id: '/empty', name: 'Empty', parts: [], bb: null },
      }).shapes.parts,
    ).toEqual([])
  })

  for (const [name, mutate, path] of [
    [
      'missing geometry',
      (value) => {
        delete value.instances
      },
      'instances',
    ],
    [
      'wrong logs',
      (value) => {
        value.logs = []
      },
      'logs',
    ],
    [
      'negative duration',
      (value) => {
        value.duration = -1
      },
      'duration',
    ],
    [
      'nonfinite duration',
      (value) => {
        value.duration = Infinity
      },
      'duration',
    ],
    [
      'wrong dtype',
      (value) => {
        value.instances[0].vertices.dtype = 'uint32'
      },
      'instances.0.vertices.dtype',
    ],
    [
      'wrong codec',
      (value) => {
        value.instances[0].vertices.codec = 'raw'
      },
      'instances.0.vertices.codec',
    ],
    [
      'invalid base64',
      (value) => {
        value.instances[0].vertices.buffer = '!'.repeat(48)
      },
      'instances.0.vertices.buffer',
    ],
    [
      'misplaced base64 padding',
      (value) => {
        value.instances[0].vertices.buffer = '=AAA'.repeat(12)
      },
      'instances.0.vertices.buffer',
    ],
    [
      'truncated buffer',
      (value) => {
        value.instances[0].vertices.buffer = 'AAAA'
      },
      'instances.0.vertices.buffer',
    ],
    [
      'fractional dimension',
      (value) => {
        value.instances[0].vertices.shape = [1.5]
      },
      'instances.0.vertices.shape',
    ],
    [
      'negative dimension',
      (value) => {
        value.instances[0].vertices.shape = [-1]
      },
      'instances.0.vertices.shape',
    ],
    [
      'overflowing dimensions',
      (value) => {
        value.instances[0].vertices.shape = [Number.MAX_SAFE_INTEGER, 2]
      },
      'instances.0.vertices.shape',
    ],
    [
      'incomplete vertex',
      (value) => {
        value.instances[0].vertices = buffer([0, 0])
      },
      'instances.0.vertices',
    ],
    [
      'incomplete triangle',
      (value) => {
        value.instances[0].triangles = buffer([0, 1], 'uint32')
      },
      'instances.0.triangles',
    ],
    [
      'incomplete edge',
      (value) => {
        value.instances[0].edges = buffer([0, 0, 0])
      },
      'instances.0.edges',
    ],
    [
      'mismatched normals',
      (value) => {
        value.instances[0].normals = buffer([0, 0, 1])
      },
      'instances.0.normals',
    ],
    [
      'mismatched UVs',
      (value) => {
        value.instances[0].uvs = buffer([0, 0])
      },
      'instances.0.uvs',
    ],
    [
      'mismatched face metadata',
      (value) => {
        value.instances[0].face_types = buffer([0, 0], 'uint32')
      },
      'instances.0.face_types',
    ],
    [
      'mismatched edge metadata',
      (value) => {
        value.instances[0].edge_types = buffer([0, 0], 'uint32')
      },
      'instances.0.edge_types',
    ],
    [
      'missing instance',
      (value) => {
        value.shapes.parts[0].shape.ref = 1
      },
      'shapes.parts.0.shape.ref',
    ],
    [
      'duplicate node id',
      (value) => {
        value.shapes.parts[0].id = value.shapes.id
      },
      'shapes.parts.0.id',
    ],
    [
      'missing node geometry',
      (value) => {
        delete value.shapes.parts[0].shape
      },
      'shapes.parts.0',
    ],
    [
      'group with geometry',
      (value) => {
        value.shapes.shape = { ref: 0 }
      },
      'shapes',
    ],
    [
      'empty inline shape',
      (value) => {
        value.shapes.parts[0].shape = {}
      },
      'shapes.parts.0.shape',
    ],
    [
      'bad reference type',
      (value) => {
        value.shapes.parts[0].shape.ref = '0'
      },
      'shapes.parts.0.shape',
    ],
    [
      'zero quaternion',
      (value) => {
        value.shapes.loc = [
          [0, 0, 0],
          [0, 0, 0, 0],
        ]
      },
      'shapes.loc',
    ],
    [
      'nonfinite location',
      (value) => {
        value.shapes.loc = [
          [Infinity, 0, 0],
          [0, 0, 0, 1],
        ]
      },
      'shapes.loc',
    ],
    [
      'reversed bounds',
      (value) => {
        value.shapes.bb = {
          xmin: 1,
          xmax: 0,
          ymin: 0,
          ymax: 1,
          zmin: 0,
          zmax: 1,
        }
      },
      'shapes.bb',
    ],
    [
      'invalid visibility state',
      (value) => {
        value.shapes.state = [2, 1]
      },
      'shapes.state',
    ],
  ]) {
    test(`rejects ${name} with the affected field`, () => {
      const value = preview()
      mutate(value)
      expect(() => parseBuild123dResult(value)).toThrow(path)
    })
  }

  test('error messages never include the geometry buffer contents', () => {
    const value = preview()
    value.instances[0].vertices.buffer = 'sensitive-buffer-value'
    try {
      parseBuild123dResult(value)
      throw new Error('Accepted invalid geometry')
    } catch (error) {
      expect(error.message).toContain('instances.0.vertices.buffer')
      expect(error.message).not.toContain('sensitive-buffer-value')
    }
  })
})

describe('build123d export protocol', () => {
  test('accepts export acknowledgements independently of preview geometry', () => {
    expect(
      parseBuild123dExportReport({
        ok: true,
        bytes: 100,
        logs: 'exported',
        duration: 1,
      }),
    ).toEqual({ ok: true, bytes: 100, logs: 'exported', duration: 1 })
    const failure = {
      ok: false,
      error: 'script failed',
      logs: 'before error',
      duration: 0,
    }
    expect(parseBuild123dExportReport(failure)).toEqual(failure)
    expect(parseBuild123dResult(failure)).toEqual(failure)
  })

  test('rejects preview/export mixups and malformed acknowledgements', () => {
    expect(() =>
      parseBuild123dResult({ ok: true, bytes: 100, logs: '', duration: 1 }),
    ).toThrow('instances')
    expect(() => parseBuild123dExportReport(preview())).toThrow('bytes')
    for (const bytes of [-1, 0, 0.5, Infinity, '100']) {
      expect(() =>
        parseBuild123dExportReport({ ok: true, bytes, logs: '', duration: 0 }),
      ).toThrow('bytes')
    }
  })
})
