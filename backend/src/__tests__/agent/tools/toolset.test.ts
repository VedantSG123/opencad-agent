import { describe, expect, test } from 'bun:test'

import { describeToolAccess } from '../../../agent/permissions/request/registry'
import { TOOL_NAMES } from '../../../agent/tools/names'

// Deliberately against the names rather than `createTools`: the point is that
// the policy can vet a tool without loading it, and `createTools` is held to
// the same list by a `satisfies` clause.
describe('permission coverage', () => {
  test('every tool the agent may be handed has a descriptor', () => {
    for (const name of TOOL_NAMES) {
      expect(describeToolAccess(name, {})).not.toBeNull()
    }
  })

  test('a name nobody registered is still refused', () => {
    expect(describeToolAccess('shell', {})).toBeNull()
  })
})
