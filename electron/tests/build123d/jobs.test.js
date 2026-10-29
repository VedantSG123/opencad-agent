import { describe, expect, test } from 'bun:test'

import { Build123dRuns } from '../../src/utils/cad/build123d/jobs'

const identity = { ownerId: 1, sessionId: 'workspace', runId: 'first' }

describe('build123d job ownership', () => {
  test('shutdown waits for cancelled work to finish cleaning up', async () => {
    const runs = new Build123dRuns()
    const started = Promise.withResolvers()
    const cleanup = Promise.withResolvers()
    const job = runs.run(identity, 'preview', async (signal) => {
      started.resolve()
      await cleanup.promise
      signal.throwIfAborted()
      return 'obsolete'
    })
    const outcome = Promise.allSettled([job])
    await started.promise
    let stopped = false
    const stopping = runs.cancelAll().then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)
    cleanup.resolve()
    await stopping
    expect(stopped).toBe(true)
    expect(await outcome).toMatchObject([
      { status: 'rejected', reason: { code: 'BUILD_CANCELLED' } },
    ])
  })

  test('a newer preview invalidates an older run still preparing', async () => {
    const runs = new Build123dRuns()
    const prepared = Promise.withResolvers()
    const first = runs.run(identity, 'preview', async (signal) => {
      await prepared.promise
      signal.throwIfAborted()
      return 'obsolete'
    })
    const latest = runs.run(
      { ...identity, runId: 'latest' },
      'preview',
      async () => 'latest',
    )
    prepared.resolve()
    await expect(first).rejects.toMatchObject({ code: 'BUILD_CANCELLED' })
    expect(await latest).toBe('latest')
  })

  test('preview replacement leaves exports and other workspaces running', async () => {
    const runs = new Build123dRuns()
    const finish = Promise.withResolvers()
    const complete = (value) => async (signal) => {
      await finish.promise
      signal.throwIfAborted()
      return value
    }
    const exported = runs.run(identity, 'export', complete('export bytes'))
    const other = runs.run(
      { ...identity, sessionId: 'other' },
      'preview',
      complete('other model'),
    )
    const preview = runs.run(
      { ...identity, runId: 'preview' },
      'preview',
      complete('preview model'),
    )
    finish.resolve()
    expect(await Promise.all([exported, other, preview])).toEqual([
      'export bytes',
      'other model',
      'preview model',
    ])
  })

  test('workspace cancellation also aborts pending exports without touching another owner', async () => {
    const runs = new Build123dRuns()
    const finish = Promise.withResolvers()
    const complete = async (signal) => {
      await finish.promise
      signal.throwIfAborted()
      return 'completed'
    }
    const own = runs.run(identity, 'export', complete)
    const other = runs.run({ ...identity, ownerId: 2 }, 'preview', complete)
    expect(runs.cancel({ ownerId: 1, sessionId: 'workspace' })).toBe(true)
    finish.resolve()
    await expect(own).rejects.toMatchObject({ code: 'BUILD_CANCELLED' })
    expect(await other).toBe('completed')
    expect(runs.cancel({ ownerId: 1, sessionId: 'workspace' })).toBe(false)
  })

  test('a delayed cancellation targets its exact run', async () => {
    const runs = new Build123dRuns()
    const finish = Promise.withResolvers()
    const latest = runs.run(
      { ...identity, runId: 'latest' },
      'preview',
      async (signal) => {
        await finish.promise
        signal.throwIfAborted()
        return 'latest'
      },
    )
    expect(runs.cancel(identity)).toBe(false)
    finish.resolve()
    expect(await latest).toBe('latest')
  })

  test('closing an owner cancels all its sessions', async () => {
    const runs = new Build123dRuns()
    const finish = Promise.withResolvers()
    const complete = async (signal) => {
      await finish.promise
      signal.throwIfAborted()
      return 'completed'
    }
    const first = runs.run(identity, 'preview', complete)
    const second = runs.run(
      { ...identity, sessionId: 'other' },
      'export',
      complete,
    )
    runs.cancelOwner(1)
    const settled = Promise.allSettled([first, second])
    finish.resolve()
    const outcomes = await settled
    expect(outcomes).toMatchObject([
      { status: 'rejected', reason: { code: 'BUILD_CANCELLED' } },
      { status: 'rejected', reason: { code: 'BUILD_CANCELLED' } },
    ])
  })
})
