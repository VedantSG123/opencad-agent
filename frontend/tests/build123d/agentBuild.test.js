import { afterEach, expect, test } from 'bun:test'

import { createBuild123dStore } from '../../src/hooks/useBuild123d'
import { build123dReport } from '../../src/kernels/build123d/buildReport'

const originalWindow = globalThis.window
afterEach(() => {
  globalThis.window = originalWindow
})
const success = (name) => ({
  success: true,
  data: {
    ok: true,
    logs: 'built\n',
    duration: 0.125,
    instances: [],
    shapes: { name, id: 'root', parts: [] },
  },
})

test('agent builds use the main snapshot, project context and explicit analysis option', async () => {
  let request
  globalThis.window = {
    electron: {
      runBuild123d: async (value) => {
        request = value
        return success('agent')
      },
    },
  }
  const store = createBuild123dStore('/project')
  const report = await store.getState().buildForAgent({
    file: 'parts/main.py',
    source: 'show(part)',
    geometrySummary: true,
  })
  expect(request).toMatchObject({
    mainPath: '/project/parts/main.py',
    projectDirectory: '/project',
    overrides: { '/project/parts/main.py': 'show(part)' },
    geometrySummary: true,
  })
  expect(request.sessionId).not.toBe(store.getState().sessionId)
  expect(report).toEqual({
    status: 'succeeded',
    durationMs: 125,
    shapes: [],
    logs: [{ level: 'log', text: 'built' }],
  })
  await store
    .getState()
    .buildForAgent({ file: 'main.py', source: 'show(part)' })
  expect(request).not.toHaveProperty('geometrySummary')
})

test('a newer user preview cannot swallow the agent result or share its cancellation scope', async () => {
  const pending = Promise.withResolvers()
  let agentRequest, userRequest
  globalThis.window = {
    electron: {
      runBuild123d: (request) => {
        if (request.geometrySummary) {
          agentRequest = request
          return pending.promise
        }
        userRequest = request
        return Promise.resolve(success('user'))
      },
    },
  }
  const store = createBuild123dStore('/project')
  const agent = store.getState().buildForAgent({
    file: 'main.py',
    source: 'show(part)',
    geometrySummary: true,
  })
  await store
    .getState()
    .build({ mainPath: '/project/main.py', projectDirectory: '/project' })
  const geometry = { parts: [], overall: null }
  const result = success('agent')
  result.data.geometry = geometry
  pending.resolve(result)
  expect(await agent).toMatchObject({ status: 'succeeded', geometry })
  expect(agentRequest.sessionId).not.toBe(userRequest.sessionId)
  expect(store.getState().model.tree.name).toBe('user')
})

test('workspace disposal cancels pending agent and user scopes', async () => {
  const pending = Promise.withResolvers()
  const cancelled = []
  let request
  globalThis.window = {
    electron: {
      runBuild123d: (value) => {
        request = value
        return pending.promise
      },
      cancelBuild123dRun: async (scope) => {
        cancelled.push(scope.sessionId)
      },
    },
  }
  const store = createBuild123dStore('/project')
  const agent = store
    .getState()
    .buildForAgent({ file: 'main.py', source: 'show(part)' })
  await store.getState().cancel()
  expect(cancelled).toEqual([store.getState().sessionId, request.sessionId])
  pending.resolve({
    success: false,
    error: { message: 'cancelled', code: 'BUILD_CANCELLED' },
  })
  expect(await agent).toEqual({ status: 'unavailable', reason: 'cancelled' })
  expect(store.getState().model).toBeNull()
})

test('failure locations only annotate the requested main file', () => {
  const failure = {
    ok: false,
    logs: 'before failure',
    duration: 0.5,
    error: 'Traceback',
    location: { file: '/project/main.py', line: 3, column: 5 },
  }
  expect(build123dReport(failure, '/project/main.py').report.error).toEqual({
    message: 'Traceback',
    line: 3,
    column: 5,
  })
  expect(
    build123dReport(
      { ...failure, location: { file: '/project/imported.py', line: 3 } },
      '/project/main.py',
    ).report.error,
  ).toEqual({ message: 'Traceback' })
})

test('agent reports infrastructure failures without claiming a model failure', async () => {
  globalThis.window = {}
  expect(
    await createBuild123dStore('/project')
      .getState()
      .buildForAgent({ file: 'main.py', source: '' }),
  ).toMatchObject({ status: 'unavailable' })
})
