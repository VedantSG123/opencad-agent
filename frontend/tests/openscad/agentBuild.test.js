import { afterEach, expect, test } from 'bun:test'

import { kernelFilesStore } from '../../src/hooks/useKernelFiles'
import { createNodeOpenSCADStore } from '../../src/hooks/useNodeOpenSCAD'

const originalWindow = globalThis.window
afterEach(() => {
  globalThis.window = originalWindow
  kernelFilesStore.getState().clearAll()
})
const report = {
  status: 'succeeded',
  durationMs: 10,
  logs: [],
  shapes: [{ name: 'main.scad', kind: '3d', rendered: true }],
}

test('agent builds use their own result and saved snapshot without editor or Customizer overrides', async () => {
  let request
  globalThis.window = {
    electron: {
      buildOpenSCAD: async (value) => {
        request = value
        return { success: true, data: report }
      },
    },
  }
  const store = createNodeOpenSCADStore('/project')
  store.getState().setVar('WIDTH', 100)
  kernelFilesStore.getState().setFileContent('/sibling.scad', 'unsaved sibling')
  const input = { file: 'main.scad', source: 'cube(2);', geometrySummary: true }
  expect(await store.getState().buildForAgent(input)).toEqual(report)
  expect(request).toEqual({ ...input, projectDirectory: '/project' })
  expect(store.getState().result).toBeNull()
  expect(store.getState().vars).toEqual({ WIDTH: 100 })
})

test('parallel agent requests each await their own report', async () => {
  const first = Promise.withResolvers(),
    second = Promise.withResolvers()
  globalThis.window = {
    electron: {
      buildOpenSCAD: (request) =>
        request.source === 'first' ? first.promise : second.promise,
    },
  }
  const store = createNodeOpenSCADStore('/project')
  const a = store
    .getState()
    .buildForAgent({ file: 'main.scad', source: 'first' })
  const b = store
    .getState()
    .buildForAgent({ file: 'main.scad', source: 'second' })
  second.resolve({ success: true, data: { ...report, durationMs: 20 } })
  expect((await b).durationMs).toBe(20)
  first.resolve({ success: true, data: report })
  expect((await a).durationMs).toBe(10)
})

test('infrastructure and malformed report failures are unavailable', async () => {
  const store = createNodeOpenSCADStore('/project')
  globalThis.window = {}
  expect(
    (await store.getState().buildForAgent({ file: 'main.scad', source: '' }))
      .status,
  ).toBe('unavailable')
  for (const buildOpenSCAD of [
    async () => ({ success: false, error: { message: 'closed' } }),
    async () => {
      throw Error('disconnected')
    },
    async () => ({ success: true, data: { status: 'succeeded' } }),
  ]) {
    window.electron = { buildOpenSCAD }
    expect(
      (await store.getState().buildForAgent({ file: 'main.scad', source: '' }))
        .status,
    ).toBe('unavailable')
  }
})
