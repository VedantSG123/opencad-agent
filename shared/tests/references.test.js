import { describe, expect, test } from 'bun:test'

import {
  messageReferenceSchema,
  parsePrompt,
  plainPrompt,
  promptForModel,
  referenceLink,
  referencesRefusal,
} from '../src/references'

const rim = {
  kind: 'edge',
  part: 'bracket',
  type: 'CIRCLE',
  facts: [{ name: 'radius', quantity: 'length', value: 9 }],
  adjacentFaces: [
    {
      type: 'PLANE',
      facts: [{ name: 'normal', quantity: 'direction', value: [0, 0, 1] }],
    },
  ],
}
const top = {
  kind: 'face',
  part: 'bracket',
  type: 'PLANE',
  facts: [{ name: 'normal', quantity: 'direction', value: [0, 0, 1] }],
}
const script = { kind: 'file', path: 'parts/bracket.py' }

describe('reference links', () => {
  test('a link reads back as the label and id it was built from', () => {
    const text = `round ${referenceLink('Edge · Circle', 1)} off`
    expect(text).toBe('round [Edge · Circle](/opencad-reference?refId=1) off')
    expect(parsePrompt(text)).toEqual([
      { type: 'text', text: 'round ' },
      { type: 'reference', label: 'Edge · Circle', id: 1 },
      { type: 'text', text: ' off' },
    ])
  })

  test('brackets and backslashes in a label survive the round trip', () => {
    const label = 'bracket [v2] \\ left'
    expect(parsePrompt(referenceLink(label, 4))).toEqual([
      { type: 'reference', label, id: 4 },
    ])
  })

  test('plain text reads each link as its label', () => {
    expect(plainPrompt(`round ${referenceLink('Edge · [r3]', 1)} off`)).toBe(
      'round Edge · [r3] off',
    )
  })

  test('an ordinary link and plain brackets stay text', () => {
    const text = 'see [docs](https://example.com) and [edge 1]'
    expect(parsePrompt(text)).toEqual([{ type: 'text', text }])
  })
})

describe('reference refusals', () => {
  const text = `${referenceLink('Edge', 1)} meets ${referenceLink('Face', 2)}`

  test('links and references that match are accepted', () => {
    const references = [
      { id: 1, ref: rim },
      { id: 2, ref: top },
    ]
    expect(referencesRefusal(text, references)).toBeNull()
    expect(referencesRefusal('no references', [])).toBeNull()
  })

  test('a link with no reference is refused', () => {
    expect(referencesRefusal(text, [{ id: 1, ref: rim }])).toBe(
      'The message links a reference it does not carry.',
    )
  })

  test('a reference with no link is refused', () => {
    expect(
      referencesRefusal(text, [
        { id: 1, ref: rim },
        { id: 2, ref: top },
        { id: 3, ref: script },
      ]),
    ).toBe('The message carries a reference it never links.')
  })

  test('two references with one id are refused', () => {
    expect(
      referencesRefusal(text, [
        { id: 1, ref: rim },
        { id: 1, ref: top },
      ]),
    ).toBe('Two references share an id.')
  })

  test('the schema takes every kind', () => {
    for (const ref of [rim, top, script, { kind: 'part', part: 'boss' }]) {
      expect(messageReferenceSchema.parse({ id: 1, ref })).toEqual({
        id: 1,
        ref,
      })
    }
  })

  test('the schema rejects an unknown kind and a non-positive id', () => {
    expect(
      messageReferenceSchema.safeParse({ id: 1, ref: { kind: 'vertex' } })
        .success,
    ).toBe(false)
    expect(
      messageReferenceSchema.safeParse({ id: 0, ref: script }).success,
    ).toBe(false)
  })
})

describe('prompt for the model', () => {
  test('links become labels, files become paths, details follow once', () => {
    const text = [
      `fillet ${referenceLink('Edge · Circle', 1)} in`,
      ` ${referenceLink('bracket.py', 2)}, then lower`,
      ` ${referenceLink('Face · Plane', 3)} to ${referenceLink('Edge · Circle', 1)}`,
    ].join('')
    expect(
      promptForModel(text, [
        { id: 3, ref: top },
        { id: 1, ref: rim },
        { id: 2, ref: script },
      ]),
    ).toBe(
      [
        'fillet [edge 1] in parts/bracket.py, then lower [face 3] to [edge 1]',
        '',
        '<reference id="1">',
        'Edge of part "bracket": Circle (world coordinates)',
        '- Radius: 9 mm',
        '- Between faces:',
        '  - Plane: normal (0, 0, 1)',
        '</reference>',
        '',
        '<reference id="3">',
        'Face of part "bracket": Plane (world coordinates)',
        '- Normal: (0, 0, 1)',
        '</reference>',
      ].join('\n'),
    )
  })

  test('a part is named in its block', () => {
    const ref = { kind: 'part', part: 'boss' }
    expect(
      promptForModel(`move ${referenceLink('boss', 1)}`, [{ id: 1, ref }]),
    ).toBe('move [part 1]\n\n<reference id="1">\nPart "boss"\n</reference>')
  })

  test('a message without references is passed through', () => {
    expect(promptForModel('make it taller', [])).toBe('make it taller')
  })
})
