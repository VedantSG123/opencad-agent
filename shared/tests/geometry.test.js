import { describe, expect, test } from 'bun:test'

import {
  factLabel,
  factValue,
  geometryRefSchema,
  geometryRefText,
} from '../src/geometry'

describe('entity fact text', () => {
  test('camel-case fact names read as words', () => {
    expect(factLabel('area')).toBe('Area')
    expect(factLabel('halfAngle')).toBe('Half angle')
    expect(factLabel('majorRadius')).toBe('Major radius')
  })

  test('each quantity is written with its unit', () => {
    expect(factValue({ name: 'r', quantity: 'length', value: 3 })).toBe('3 mm')
    expect(factValue({ name: 'a', quantity: 'area', value: 2200 })).toBe(
      '2200 mm²',
    )
    expect(factValue({ name: 's', quantity: 'angle', value: 360 })).toBe('360°')
    expect(
      factValue({ name: 'c', quantity: 'point', value: [100, -5, 0.5] }),
    ).toBe('(100, -5, 0.5)')
    expect(factValue({ name: 'f', quantity: 'faces', value: [0, 3] })).toBe(
      '0, 3',
    )
    expect(factValue({ name: 'k', quantity: 'label', value: 'seam' })).toBe(
      'seam',
    )
  })

  test('rotation noise does not reach the reader', () => {
    expect(
      factValue({
        name: 'n',
        quantity: 'direction',
        value: [-1.2e-16, 0.70710678, 0.9999999],
      }),
    ).toBe('(0, 0.707, 1)')
    expect(factValue({ name: 'r', quantity: 'length', value: 2.99999 })).toBe(
      '3 mm',
    )
  })
})

const RIM = {
  part: 'bracket',
  kind: 'edge',
  type: 'CIRCLE',
  facts: [
    { name: 'radius', quantity: 'length', value: 9 },
    { name: 'center', quantity: 'point', value: [0, 0, -4] },
    { name: 'sweep', quantity: 'angle', value: 360 },
    { name: 'class', quantity: 'label', value: 'feature' },
  ],
  adjacentFaces: [
    {
      type: 'PLANE',
      facts: [{ name: 'normal', quantity: 'direction', value: [0, 0, -1] }],
    },
    {
      type: 'CYLINDER',
      facts: [
        { name: 'radius', quantity: 'length', value: 9 },
        { name: 'axis', quantity: 'direction', value: [0, 0, 1] },
      ],
    },
  ],
}

describe('geometry reference', () => {
  test('reads as the entity first, then the faces it sits between', () => {
    expect(geometryRefText(RIM)).toBe(
      [
        'Edge of part "bracket": Circle (world coordinates)',
        '- Radius: 9 mm',
        '- Center: (0, 0, -4)',
        '- Sweep: 360°',
        '- Class: feature',
        '- Between faces:',
        '  - Plane: normal (0, 0, -1)',
        '  - Cylinder: radius 9 mm, axis (0, 0, 1)',
      ].join('\n'),
    )
  })

  test('a face reads without a neighbour list', () => {
    const face = {
      part: 'bracket',
      kind: 'face',
      type: 'PLANE',
      facts: [{ name: 'area', quantity: 'area', value: 2045.5312 }],
    }
    expect(geometryRefText(face)).toBe(
      'Face of part "bracket": Plane (world coordinates)\n- Area: 2045.531 mm²',
    )
  })

  test('a reference cannot carry face indices from the build it came from', () => {
    expect(geometryRefSchema.safeParse(RIM).success).toBe(true)
    const indexed = {
      ...RIM,
      facts: [...RIM.facts, { name: 'faces', quantity: 'faces', value: [4] }],
    }
    expect(geometryRefSchema.safeParse(indexed).success).toBe(false)
  })
})
