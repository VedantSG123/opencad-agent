import { describe, expect, test } from 'bun:test'

import {
  build123dReadout,
  build123dViewState,
  updateBuild123dViewState,
} from '../../src/kernels/build123d/interaction'

function model(name = 'plate', state = [1, 1]) {
  const node = { id: '/root/0', name, shape: { ref: 0 }, state }
  return {
    tree: { id: '/root', name: 'assembly', parts: [node] },
    parts: [
      {
        id: node.id,
        name,
        instance: {
          faceTypes: new Uint32Array([0, 1]),
          edgeTypes: new Uint32Array([0]),
        },
      },
    ],
    instances: [],
  }
}

function apply(state, action) {
  return updateBuild123dViewState(state, { model: state.model, ...action })
}

describe('build123d viewer interactions', () => {
  test('a new model clears all selections and resets visibility even when IDs are reused', () => {
    const first = model()
    let state = build123dViewState(first)
    state = apply(state, { type: 'face', partId: '/root/0', index: 1 })
    state = apply(state, { type: 'edge', partId: '/root/0', index: 0 })
    state = apply(state, { type: 'node', node: first.tree })
    state = apply(state, {
      type: 'visibility',
      ids: ['/root/0'],
      kind: 'faces',
      value: false,
    })
    const rebuilt = build123dViewState(model('replacement'), state)
    expect(rebuilt.face).toBeNull()
    expect(rebuilt.edge).toBeNull()
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
    state = apply(state, { type: 'face', partId: '/root/0', index: 0 })
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
        const state = apply(build123dViewState(model()), {
          type,
          partId: '/root/0',
          index,
        })
        expect(state[type]).toBeNull()
        expect(build123dReadout(state)).toBeNull()
      })
    }
  }

  test('missing parts and nodes cannot become selected', () => {
    let state = build123dViewState(model())
    state = apply(state, { type: 'face', partId: 'missing', index: 0 })
    state = apply(state, {
      type: 'node',
      node: { id: 'missing', name: 'old part', shape: { ref: 0 } },
    })
    expect(state.face).toBeNull()
    expect(state.selectedNode).toBeNull()
    expect(state.selectedParts).toEqual([])
    expect(build123dReadout(state)).toBeNull()
  })

  test('old model callbacks cannot alter the new model', () => {
    const old = model()
    const current = build123dViewState(model('new model'))
    const next = updateBuild123dViewState(current, {
      model: old,
      type: 'face',
      partId: '/root/0',
      index: 0,
    })
    expect(next).toBe(current)
    expect(build123dReadout(next)).toBeNull()
  })

  test('face and edge toggles keep the latest valid readout and fall back to the survivor', () => {
    let state = build123dViewState(model())
    state = apply(state, { type: 'face', partId: '/root/0', index: 1 })
    state = apply(state, { type: 'edge', partId: '/root/0', index: 0 })
    expect(build123dReadout(state)).toEqual({
      kind: 'edge',
      index: 0,
      subject: 'plate',
      geometryType: 'Line',
    })
    state = apply(state, { type: 'edge', partId: '/root/0', index: 0 })
    expect(build123dReadout(state)).toEqual({
      kind: 'face',
      index: 1,
      subject: 'plate',
      geometryType: 'Cylinder',
    })
    state = apply(state, { type: 'face', partId: '/root/0', index: 1 })
    expect(build123dReadout(state)).toBeNull()
  })

  test('readout rejects a missing part or a component outside the current topology', () => {
    const state = build123dViewState(model())
    expect(
      build123dReadout({
        ...state,
        face: { partId: '/root/0', index: 9 },
        lastKind: 'face',
      }),
    ).toBeNull()
    expect(
      build123dReadout({
        ...state,
        face: { partId: 'missing', index: 0 },
        lastKind: 'face',
      }),
    ).toBeNull()
  })
})
