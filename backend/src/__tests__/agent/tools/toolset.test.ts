import { describe, expect, test } from 'bun:test'

import { describeToolAccess } from '../../../agent/permissions/request/registry'
import { TOOL_NAMES } from '../../../agent/tools/names'
import { toolFailed } from '../../../agent/tools/types'

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
    expect(describeToolAccess('httpRequest', {})).toBeNull()
  })
})

// Tools answer failure in prose rather than by throwing, so the agent loop has
// only the wording to go on when it decides whether a call succeeded. These
// hold every failure path to the one prefix `toolFailed` looks for.
describe('failure output convention', () => {
  test('every tool failure the loop will see is recognised as one', () => {
    const failures = [
      'Error: `path` must name a file to read.',
      'Error: file not found: main.scad',
      'Error running search: ripgrep exited with code 2.',
      'Error reading file: EACCES',
      'Error editing file: EPERM',
      'Error creating file: EEXIST',
      'Error running command: spawn failed',
      'Error retrieving documentation for class "Sketch": missing',
      'Error: no changes were made to main.scad. 1 block failed to apply.',
    ]

    for (const failure of failures) {
      expect(toolFailed(failure)).toBe(true)
    }
  })

  test('ordinary results are not mistaken for failures', () => {
    const results = [
      'Edited main.scad: applied 1 of 1 block (still 7 lines).',
      'Created swap.ps1 (3 lines, 139 bytes).',
      'main.scad is empty.',
      'No matches found for pattern "foo" in the project directory.',
      'File: main.scad\nLines 1-2 of 2',
      // A file whose contents happen to talk about errors.
      'const Errors = require("./errors")',
    ]

    for (const result of results) {
      expect(toolFailed(result)).toBe(false)
    }
  })
})
