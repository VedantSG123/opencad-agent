import { describe, expect, test } from 'bun:test'

import {
  applyPicks,
  pickInMode,
  picksByPart,
  picksInMode,
} from '../../src/components/cad/picks'

const applyPick = (picked, pick, additive) =>
  applyPicks(picked, [pick], additive)

const face = (index, partId = 'bracket') => ({ kind: 'face', partId, index })
const edge = (index, partId = 'bracket') => ({ kind: 'edge', partId, index })
const part = (partId = 'bracket') => ({ kind: 'part', partId })

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
    const byPart = picksByPart([
      face(1),
      edge(0),
      face(3),
      face(0, 'boss'),
      part('lid'),
    ])
    expect(byPart.get('bracket')).toEqual({
      whole: false,
      faces: [1, 3],
      edges: [0],
    })
    expect(byPart.get('boss')).toEqual({ whole: false, faces: [0], edges: [] })
    expect(byPart.get('lid')).toEqual({ whole: true, faces: [], edges: [] })
    expect(byPart.get('base')).toBeUndefined()
  })

  test('a part and one of its faces are different picks', () => {
    expect(applyPick([part()], face(0), true)).toEqual([part(), face(0)])
    expect(applyPick([part(), face(0)], part(), true)).toEqual([face(0)])
  })

  test('a group of parts is added together and taken out together', () => {
    const group = [part('lid'), part('base')]
    expect(applyPicks([part('lid')], group, true)).toEqual(group)
    expect(applyPicks([face(0), ...group], group, true)).toEqual([face(0)])
    expect(applyPicks([face(0)], group, false)).toEqual(group)
    expect(applyPicks(group, group, false)).toEqual([])
  })
})

describe('pick modes', () => {
  test('faces and edges takes whichever was clicked', () => {
    expect(pickInMode('faces-and-edges', 'face', 'bracket', 1)).toEqual(face(1))
    expect(pickInMode('faces-and-edges', 'edge', 'bracket', 0)).toEqual(edge(0))
  })

  test('faces and edges alone ignore the other kind', () => {
    expect(pickInMode('faces', 'edge', 'bracket', 0)).toBeNull()
    expect(pickInMode('edges', 'face', 'bracket', 1)).toBeNull()
    expect(picksInMode('faces', 'edge')).toBe(false)
    expect(picksInMode('edges', 'face')).toBe(false)
  })

  test('parts turns any click into the whole part', () => {
    expect(pickInMode('parts', 'face', 'bracket', 1)).toEqual(part())
    expect(pickInMode('parts', 'edge', 'bracket', 0)).toEqual(part())
    expect(picksInMode('parts', 'face') && picksInMode('parts', 'edge')).toBe(
      true,
    )
  })
})
