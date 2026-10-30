import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('the OpenSCAD store and agent report validation bundle for the browser', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openscad-browser-test-'))
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        'build',
        path.resolve(import.meta.dir, '../../src/hooks/useNodeOpenSCAD.tsx'),
        '--target=browser',
        '--outdir',
        directory,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const [exitCode, stderr] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ])
    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
