import { afterEach, describe, expect, test } from 'bun:test'

import { createBuild123dStore } from '../../src/hooks/useBuild123d'

const originalWindow = globalThis.window

afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
})

const success = {
  success: true,
  data: {
    ok: true,
    logs: 'built latest source\n',
    duration: 0.25,
    instances: [],
    shapes: { id: 'assembly', name: 'Latest model', parts: [] },
  },
}

const failures = [
  {
    name: 'rejected IPC',
    run: () => Promise.reject(new Error('Python IPC disconnected')),
    message: 'Python IPC disconnected',
    logs: [],
    duration: null,
  },
  {
    name: 'non-Error rejection',
    run: () => Promise.reject('Connection closed'),
    message: 'Connection closed',
    logs: [],
    duration: null,
  },
  {
    name: 'IPC failure result',
    run: async () => ({
      success: false,
      error: { code: 'BUILD_TIMEOUT', message: 'The script timed out' },
    }),
    message: 'The script timed out',
    logs: [],
    duration: null,
  },
  {
    name: 'Python failure',
    run: async () => ({
      success: true,
      data: {
        ok: false,
        error: 'Invalid fillet',
        logs: 'making fillet\n',
        duration: 1,
      },
    }),
    message: 'Invalid fillet',
    logs: ['making fillet'],
    duration: 1,
  },
  {
    name: 'geometry decoding failure',
    run: async () => ({
      success: true,
      data: {
        ...success.data,
        logs: 'tessellated\n',
        instances: [
          {
            vertices: {
              dtype: 'float64',
              shape: [0],
              codec: 'b64',
              buffer: '',
            },
          },
        ],
      },
    }),
    message: 'Expected a float32 buffer from the build123d runner, got float64',
    logs: ['tessellated'],
    duration: 0.25,
  },
  {
    name: 'missing desktop bridge',
    run: null,
    message: 'build123d builds need the desktop app.',
    logs: [],
    duration: null,
  },
]

for (const [action, method, request] of [
  [
    'build',
    'runBuild123d',
    { mainPath: '/project/main.py', projectDirectory: '/project' },
  ],
  ['buildSource', 'runBuild123dSource', 'show(Box(10, 20, 30))'],
]) {
  describe(action, () => {
    test('an obsolete result cannot replace the latest model or its build status', async () => {
      const pending = Promise.withResolvers()
      globalThis.window = { electron: { [method]: () => pending.promise } }
      const store = createBuild123dStore()
      const first = store.getState()[action](request)
      window.electron[method] = async () => success
      await store.getState()[action](request)
      expect(store.getState().model?.tree.name).toBe('Latest model')
      pending.resolve({
        success: true,
        data: { ok: false, error: 'obsolete failure', logs: '', duration: 1 },
      })
      await first
      expect(store.getState().error).toBeNull()
      expect(store.getState().model?.tree.name).toBe('Latest model')
      expect(store.getState().isBuilding).toBe(false)
    })

    test('workspace cancellation suppresses pending results and can be followed by a new build', async () => {
      const pending = Promise.withResolvers()
      let cancelled
      globalThis.window = {
        electron: {
          [method]: () => pending.promise,
          cancelBuild123dRun: async (scope) => {
            cancelled = scope
            return { success: true, data: true }
          },
        },
      }
      const store = createBuild123dStore()
      const first = store.getState()[action](request)
      await store.getState().cancel()
      expect(cancelled).toEqual({ sessionId: store.getState().sessionId })
      pending.resolve(success)
      await first
      expect(store.getState().model).toBeNull()
      expect(store.getState().isBuilding).toBe(false)
      window.electron[method] = async () => success
      await store.getState()[action](request)
      expect(store.getState().model.tree.name).toBe('Latest model')
    })

    for (const failure of failures) {
      test(`recovers from ${failure.name} and accepts another build`, async () => {
        globalThis.window = { electron: { [method]: async () => success } }
        const store = createBuild123dStore()
        const build = store.getState()[action]
        await build(request)
        expect(store.getState().model.tree.name).toBe('Latest model')

        window.electron = failure.run ? { [method]: failure.run } : undefined
        await expect(build(request)).resolves.toBeUndefined()

        const failed = store.getState()
        expect(failed.isBuilding).toBe(false)
        expect(failed.model).toBeNull()
        expect(failed.error).toBe(failure.message)
        expect(failed.duration).toBe(failure.duration)
        expect(failed.logs.map(({ text }) => text)).toEqual([
          ...failure.logs,
          failure.message,
        ])
        expect(failed.logs.at(-1).type).toBe('error')

        window.electron = { [method]: async () => success }
        await build(request)
        expect(store.getState().isBuilding).toBe(false)
        expect(store.getState().error).toBeNull()
        expect(store.getState().model.tree.name).toBe('Latest model')
        expect(store.getState().logs.map(({ text }) => text)).toEqual([
          'built latest source',
        ])
      })
    }

    test('a newer build succeeds when the older build rejects', async () => {
      const pending = Promise.withResolvers()
      globalThis.window = { electron: { [method]: () => pending.promise } }
      const store = createBuild123dStore()
      const build = store.getState()[action]
      const first = build(request)
      expect(store.getState().isBuilding).toBe(true)
      window.electron[method] = async () => success
      await build(request)
      pending.reject(new Error('First build disconnected'))
      await expect(first).resolves.toBeUndefined()
      expect(store.getState().isBuilding).toBe(false)
      expect(store.getState().error).toBeNull()
      expect(store.getState().model.tree.name).toBe('Latest model')
    })
  })
}
