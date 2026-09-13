import { describe, expect, test } from 'bun:test'

import { createRepetitionGuard } from '../../../agent/loop'

const call = (toolName: string, input: unknown) =>
  ({ toolName, input }) as Parameters<
    ReturnType<typeof createRepetitionGuard>['refusalFor']
  >[0]

describe('createRepetitionGuard', () => {
  test('the third identical call in a row is refused', () => {
    const guard = createRepetitionGuard()
    const edit = () => call('edit', { path: 'main.scad', diff: 'x' })

    expect(guard.refusalFor(edit())).toBeNull()
    expect(guard.refusalFor(edit())).toBeNull()
    expect(guard.refusalFor(edit())).toContain('same arguments')
  })

  test('it keeps refusing rather than letting the fourth through', () => {
    const guard = createRepetitionGuard()
    const edit = () => call('edit', { path: 'main.scad', diff: 'x' })

    guard.refusalFor(edit())
    guard.refusalFor(edit())
    guard.refusalFor(edit())
    expect(guard.refusalFor(edit())).not.toBeNull()
  })

  test('a different argument resets the run', () => {
    const guard = createRepetitionGuard()

    guard.refusalFor(call('edit', { path: 'a.scad', diff: 'x' }))
    guard.refusalFor(call('edit', { path: 'a.scad', diff: 'x' }))
    expect(
      guard.refusalFor(call('edit', { path: 'a.scad', diff: 'y' })),
    ).toBeNull()
  })

  test('reading the same file again after an edit is not a repeat', () => {
    const guard = createRepetitionGuard()
    const read = () => call('read', { path: 'main.scad' })

    expect(guard.refusalFor(read())).toBeNull()
    expect(guard.refusalFor(read())).toBeNull()
    guard.refusalFor(call('edit', { path: 'main.scad', diff: 'x' }))
    // The run was broken by the edit, so the file may be read as many times
    // as the work needs.
    expect(guard.refusalFor(read())).toBeNull()
    expect(guard.refusalFor(read())).toBeNull()
  })

  test('the same arguments to different tools are unrelated', () => {
    const guard = createRepetitionGuard()

    guard.refusalFor(call('read', { path: 'main.scad' }))
    guard.refusalFor(call('read', { path: 'main.scad' }))
    expect(guard.refusalFor(call('grep', { path: 'main.scad' }))).toBeNull()
  })
})
