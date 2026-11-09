import { describe, expect, test } from 'bun:test'

import { factLabel, factValue } from '../../src/components/cad/factText'

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
