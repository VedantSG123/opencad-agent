import { beforeEach, describe, expect, test } from 'bun:test'

import { kernelFilesStore } from '../../src/hooks/useKernelFiles'
import { createKernelFileSync } from '../../src/lib/kernelFileSync'

const event = (type, path) => ({ event: 'fs:watch', type, path })
const setFile = (path, content) =>
  kernelFilesStore.getState().setFileContent(path, content)
const files = () => kernelFilesStore.getState().files

beforeEach(() => kernelFilesStore.getState().clearAll())

describe('kernel filesystem synchronization', () => {
  test('loads a newly added module and removes its buffer when it is renamed', async () => {
    const sync = createKernelFileSync({
      readFile: async () => 'value = 12',
      isDirty: () => false,
    })
    await sync.handle(event('add', '/parts.py'))
    expect(files()['/parts.py']?.content).toBe('value = 12')
    await sync.handle(event('unlink', '/parts.py'))
    await sync.handle(event('add', '/renamed.py'))
    expect(files()['/parts.py']).toBeUndefined()
    expect(files()['/renamed.py']?.content).toBe('value = 12')
  })

  test('deleting a directory clears its clean descendants and keeps dirty buffers', async () => {
    setFile('/parts/clean.py', 'clean')
    setFile('/parts/dirty.py', 'unsaved')
    setFile('/other.py', 'other')
    const sync = createKernelFileSync({
      readFile: async () => '',
      isDirty: (path) => path === '/parts/dirty.py',
    })
    await sync.handle(event('unlinkDir', '/parts'))
    expect(files()).toEqual({
      '/parts/dirty.py': { content: 'unsaved' },
      '/other.py': { content: 'other' },
    })
    await sync.handle(event('unlink', '/parts/dirty.py'))
    expect(files()['/parts/dirty.py']?.content).toBe('unsaved')
  })

  test('a late read cannot restore a deleted module', async () => {
    const pending = Promise.withResolvers()
    setFile('/part.py', 'old')
    const sync = createKernelFileSync({
      readFile: () => pending.promise,
      isDirty: () => false,
    })
    const reading = sync.handle(event('change', '/part.py'))
    await sync.handle(event('unlink', '/part.py'))
    pending.resolve('deleted content')
    await reading
    expect(files()['/part.py']).toBeUndefined()
  })

  test('a later event wins when reads complete out of order', async () => {
    const first = Promise.withResolvers()
    let reads = 0
    const sync = createKernelFileSync({
      readFile: () => (++reads === 1 ? first.promise : Promise.resolve('new')),
      isDirty: () => false,
    })
    const reading = sync.handle(event('change', '/part.py'))
    await sync.handle(event('change', '/part.py'))
    first.resolve('old')
    await reading
    expect(files()['/part.py']?.content).toBe('new')
  })

  test('deleting a directory invalidates reads still pending below it', async () => {
    const pending = Promise.withResolvers()
    const sync = createKernelFileSync({
      readFile: () => pending.promise,
      isDirty: () => false,
    })
    const reading = sync.handle(event('change', '/parts/part.py'))
    await sync.handle(event('unlinkDir', '/parts'))
    pending.resolve('removed module')
    await reading
    expect(files()).toEqual({})
  })

  test('local edits made during a disk read are preserved even before dirty state updates', async () => {
    const pending = Promise.withResolvers()
    setFile('/part.py', 'old')
    const sync = createKernelFileSync({
      readFile: () => pending.promise,
      isDirty: () => false,
    })
    const reading = sync.handle(event('change', '/part.py'))
    setFile('/part.py', 'unsaved edit')
    pending.resolve('external edit')
    await reading
    expect(files()['/part.py']?.content).toBe('unsaved edit')
  })

  test('disposing the workspace prevents pending reads from populating the next workspace', async () => {
    const pending = Promise.withResolvers()
    const sync = createKernelFileSync({
      readFile: () => pending.promise,
      isDirty: () => false,
    })
    const reading = sync.handle(event('change', '/part.py'))
    sync.dispose()
    kernelFilesStore.getState().clearAll()
    pending.resolve('previous project')
    await reading
    expect(files()).toEqual({})
  })

  test('a tab marked dirty during the read keeps its buffer', async () => {
    const pending = Promise.withResolvers()
    let dirty = false
    setFile('/part.py', 'local buffer')
    const sync = createKernelFileSync({
      readFile: () => pending.promise,
      isDirty: () => dirty,
    })
    const reading = sync.handle(event('change', '/part.py'))
    dirty = true
    pending.resolve('disk content')
    await reading
    expect(files()['/part.py']?.content).toBe('local buffer')
  })

  test('an unreadable clean file cannot keep building its previous cached content', async () => {
    setFile('/part.py', 'stale content')
    const sync = createKernelFileSync({
      readFile: async () => {
        throw new Error('Access denied')
      },
      isDirty: () => false,
    })
    await sync.handle(event('change', '/part.py'))
    expect(files()['/part.py']).toBeUndefined()
  })

  test('asset changes invalidate disk builds without loading binary contents', async () => {
    const reads = []
    const sync = createKernelFileSync({
      readFile: async (path) => {
        reads.push(path)
        return 'binary'
      },
      isDirty: () => false,
    })
    const before = kernelFilesStore.getState().filesystemRevision
    await sync.handle(event('change', '/assets/bracket.step'))
    await sync.handle(event('add', '/assets/mesh.stl'))
    expect(kernelFilesStore.getState().filesystemRevision).toBe(before + 2)
    expect(reads).toEqual([])
    expect(files()).toEqual({})
  })

  test('Python caches and generated outputs cannot trigger another compilation', async () => {
    const sync = createKernelFileSync({
      readFile: async () => 'ignored',
      isDirty: () => false,
    })
    const before = kernelFilesStore.getState().filesystemRevision
    for (const path of [
      '/__pycache__/main.pyc',
      '/.venv/lib/package.py',
      '/exports/model.step',
      '/output/model.stl',
      '/node_modules/library/index.js',
    ]) {
      await sync.handle(event('change', path))
    }
    expect(kernelFilesStore.getState().filesystemRevision).toBe(before)
    expect(files()).toEqual({})
  })
})
