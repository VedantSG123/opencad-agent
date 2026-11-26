import { describe, expect, test } from 'bun:test'

import {
  build123dReadout,
  build123dViewState,
  updateBuild123dViewState,
} from '../../src/kernels/build123d/interaction'

const RADIUS = { name: 'radius', quantity: 'length', value: 3 }
const AXIS = { name: 'axis', quantity: 'direction', value: [0, 0, 1] }
const DIRECTION = { name: 'direction', quantity: 'direction', value: [1, 0, 0] }
const BETWEEN = { name: 'faces', quantity: 'faces', value: [0, 1] }

function model(name = 'plate', state = [1, 1]) {
  const node = { id: '/root/0', name, shape: { ref: 0 }, state }
  return {
    tree: { id: '/root', name: 'assembly', parts: [node] },
    parts: [
      {
        id: node.id,
        name,
        location: [
          [0, 0, 0],
          [0, 0, 0, 1],
        ],
        instance: {
          faceTypes: new Uint32Array([0, 1]),
          edgeTypes: new Uint32Array([0]),
          localFacts: {
            faces: [
              { ordinal: 1, type: 'PLANE', facts: [] },
              { ordinal: 2, type: 'CYLINDER', facts: [RADIUS, AXIS] },
            ],
            edges: [{ ordinal: 1, type: 'LINE', facts: [DIRECTION, BETWEEN] }],
          },
        },
      },
    ],
    instances: [],
  }
}

function apply(state, action) {
  return updateBuild123dViewState(state, { model: state.model, ...action })
}

function pick(state, kind, index, additive = false, partId = '/root/0') {
  return apply(state, {
    type: 'pick',
    pick: { kind, partId, index },
    additive,
  })
}

const FACE_1 = { kind: 'face', partId: '/root/0', index: 1 }
const EDGE_0 = { kind: 'edge', partId: '/root/0', index: 0 }

describe('build123d viewer interactions', () => {
  test('a new model clears all selections and resets visibility even when IDs are reused', () => {
    const first = model()
    let state = build123dViewState(first)
    state = pick(state, 'face', 1)
    state = pick(state, 'edge', 0, true)
    state = apply(state, { type: 'node', node: first.tree })
    state = apply(state, {
      type: 'visibility',
      ids: ['/root/0'],
      kind: 'faces',
      value: false,
    })
    const rebuilt = build123dViewState(model('replacement'), state)
    expect(rebuilt.picked).toEqual([])
    expect(rebuilt.selectedNode).toBeNull()
    expect(rebuilt.selectedParts).toEqual([])
    expect(rebuilt.visibility).toEqual({
      '/root/0': { faces: true, edges: true },
    })
    expect(build123dReadout(rebuilt)).toBeNull()
    expect(rebuilt.revision).toBe(1)
  })

  test('the same model preserves its user visibility toggles and selections', () => {
    const current = model()
    let state = build123dViewState(current)
    state = pick(state, 'face', 0)
    state = apply(state, {
      type: 'visibility',
      ids: ['/root/0'],
      kind: 'edges',
      value: false,
    })
    expect(build123dViewState(current, state)).toBe(state)
    expect(build123dReadout(state)).toEqual({
      kind: 'face',
      index: 0,
      subject: 'plate',
      geometryType: 'Plane',
      facts: [],
      reference: { part: 'plate', kind: 'face', type: 'PLANE', facts: [] },
    })
    expect(state.visibility['/root/0']).toEqual({ faces: true, edges: false })
  })

  test('new model visibility defaults apply before the next interaction', () => {
    const previous = build123dViewState(model())
    const state = build123dViewState(model('wire', [3, 0]), previous)
    expect(state.visibility).toEqual({
      '/root/0': { faces: false, edges: false },
    })
  })

  test('a failed or empty compilation clears its previous selections and masks', () => {
    const original = model()
    let state = apply(build123dViewState(original), {
      type: 'node',
      node: original.tree,
    })
    state = build123dViewState(null, state)
    expect(state.selectedParts).toEqual([])
    expect(state.visibility).toEqual({})
    expect(build123dReadout(state)).toBeNull()
  })

  for (const type of ['face', 'edge']) {
    for (const index of [-1, 0.5, 2, Infinity]) {
      test(`rejects invalid ${type} index ${index}`, () => {
        const state = pick(build123dViewState(model()), type, index)
        expect(state.picked).toEqual([])
        expect(build123dReadout(state)).toBeNull()
      })
    }
  }

  test('missing parts and nodes cannot become selected', () => {
    let state = build123dViewState(model())
    state = pick(state, 'face', 0, false, 'missing')
    state = apply(state, {
      type: 'node',
      node: { id: 'missing', name: 'old part', shape: { ref: 0 } },
    })
    expect(state.picked).toEqual([])
    expect(state.selectedNode).toBeNull()
    expect(state.selectedParts).toEqual([])
    expect(build123dReadout(state)).toBeNull()
  })

  test('old model callbacks cannot alter the new model', () => {
    const old = model()
    const current = build123dViewState(model('new model'))
    const next = updateBuild123dViewState(current, {
      model: old,
      type: 'pick',
      pick: { kind: 'face', partId: '/root/0', index: 0 },
      additive: false,
    })
    expect(next).toBe(current)
    expect(build123dReadout(next)).toBeNull()
  })

  test('a click replaces the picks, and a click on the only pick clears it', () => {
    let state = build123dViewState(model())
    state = pick(state, 'face', 1)
    state = pick(state, 'edge', 0, true)
    state = pick(state, 'face', 0)
    expect(state.picked).toEqual([
      { kind: 'face', partId: '/root/0', index: 0 },
    ])
    state = pick(state, 'face', 0)
    expect(state.picked).toEqual([])
  })

  test('a click on one of several picks keeps only that one', () => {
    let state = build123dViewState(model())
    state = pick(state, 'face', 1)
    state = pick(state, 'edge', 0, true)
    state = pick(state, 'face', 1)
    expect(state.picked).toEqual([FACE_1])
  })

  test('clearing drops every pick', () => {
    let state = build123dViewState(model())
    state = pick(state, 'face', 1)
    state = pick(state, 'edge', 0, true)
    state = apply(state, { type: 'clear' })
    expect(state.picked).toEqual([])
    expect(apply(state, { type: 'clear' })).toBe(state)
  })

  test('shift-clicks add and remove picks, and the readout names the last', () => {
    let state = build123dViewState(model())
    state = pick(state, 'face', 1)
    state = pick(state, 'edge', 0, true)
    expect(state.picked).toEqual([FACE_1, EDGE_0])
    expect(build123dReadout(state)).toEqual({
      kind: 'edge',
      index: 0,
      subject: 'plate',
      geometryType: 'Line',
      facts: [DIRECTION, BETWEEN],
      reference: {
        part: 'plate',
        kind: 'edge',
        type: 'LINE',
        facts: [DIRECTION],
        adjacentFaces: [
          { type: 'PLANE', facts: [] },
          { type: 'CYLINDER', facts: [RADIUS, AXIS] },
        ],
      },
    })
    state = pick(state, 'edge', 0, true)
    expect(state.picked).toEqual([FACE_1])
    expect(build123dReadout(state)).toEqual({
      kind: 'face',
      index: 1,
      subject: 'plate',
      geometryType: 'Cylinder',
      facts: [RADIUS, AXIS],
      reference: {
        part: 'plate',
        kind: 'face',
        type: 'CYLINDER',
        facts: [RADIUS, AXIS],
      },
    })
    state = pick(state, 'face', 1, true)
    expect(state.picked).toEqual([])
    expect(build123dReadout(state)).toBeNull()
  })

  test('a component the runner sent no facts for is named without a type', () => {
    const current = model()
    delete current.parts[0].instance.localFacts
    const state = pick(build123dViewState(current), 'face', 1)
    expect(build123dReadout(state)).toEqual({
      kind: 'face',
      index: 1,
      subject: 'plate',
    })
  })

  test('readout rejects a missing part or a component outside the current topology', () => {
    const state = build123dViewState(model())
    expect(
      build123dReadout({
        ...state,
        picked: [{ kind: 'face', partId: '/root/0', index: 9 }],
      }),
    ).toBeNull()
    expect(
      build123dReadout({
        ...state,
        picked: [{ kind: 'face', partId: 'missing', index: 0 }],
      }),
    ).toBeNull()
  })
})
