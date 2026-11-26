import { describe, expect, test } from 'bun:test'

import { applyPick, picksByPart } from '../../src/components/cad/picks'

const face = (index, partId = 'bracket') => ({ kind: 'face', partId, index })
const edge = (index, partId = 'bracket') => ({ kind: 'edge', partId, index })

describe('picks', () => {
  test('a click replaces every pick', () => {
    expect(applyPick([face(1), edge(0)], face(2), false)).toEqual([face(2)])
  })

  test('a click on the only pick clears it', () => {
    expect(applyPick([face(1)], face(1), false)).toEqual([])
  })

  test('a click on one of several picks keeps only that one', () => {
    expect(applyPick([face(1), edge(0)], face(1), false)).toEqual([face(1)])
  })

  test('shift adds a pick at the end and takes a picked one back out', () => {
    const picked = applyPick([face(1)], edge(0), true)
    expect(picked).toEqual([face(1), edge(0)])
    expect(applyPick(picked, face(1), true)).toEqual([edge(0)])
  })

  test('a face and an edge with the same index are different picks', () => {
    expect(applyPick([face(0)], edge(0), true)).toEqual([face(0), edge(0)])
  })

  test('the same index on another part is a different pick', () => {
    expect(applyPick([face(0)], face(0, 'boss'), true)).toEqual([
      face(0),
      face(0, 'boss'),
    ])
  })

  test('picks are grouped by part for highlighting', () => {
    const byPart = picksByPart([face(1), edge(0), face(3), face(0, 'boss')])
    expect(byPart.get('bracket')).toEqual({ faces: [1, 3], edges: [0] })
    expect(byPart.get('boss')).toEqual({ faces: [0], edges: [] })
    expect(byPart.get('lid')).toBeUndefined()
  })
})
