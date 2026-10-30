import { afterEach, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  summarizeDrawing,
  summarizeOff,
} from '../../src/utils/cad/openscad/geometrySummary'
import { OpenSCADWrapper } from '../../src/utils/cad/openscad/OpenSCADWrapper'

const resources = path.resolve(import.meta.dir, '../../openscad-libs')
const binary = path.join(
  resources,
  'bin',
  process.platform === 'linux'
    ? 'OpenSCAD.AppDir/usr/bin/openscad'
    : process.platform === 'win32'
      ? 'openscad.exe'
      : 'openscad',
)
const directories = []
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  )
})
async function fixture() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'openscad-build-test-'),
  )
  directories.push(directory)
  const projectDirectory = path.join(directory, 'project')
  await fs.mkdir(projectDirectory)
  await fs.writeFile(
    path.join(projectDirectory, 'main.scad'),
    'assert(false,"old disk source");',
  )
  return {
    directory,
    projectDirectory,
    wrapper: new OpenSCADWrapper(resources, directory),
  }
}

const nativeTest = test.skipIf(!existsSync(binary))
nativeTest(
  'agent builds compile the requested snapshot and disk-backed includes, with mesh-only facts',
  async () => {
    const { wrapper, projectDirectory } = await fixture()
    await fs.writeFile(path.join(projectDirectory, 'sizes.scad'), 'WIDTH=10;')
    const report = await wrapper.buildForAgent({
      file: 'main.scad',
      projectDirectory,
      source: 'include <sizes.scad>; echo("snapshot"); cube([WIDTH,20,30]);',
      geometrySummary: true,
    })
    expect(report.status).toBe('succeeded')
    expect(report.logs).toContainEqual({
      level: 'log',
      text: 'ECHO: "snapshot"',
    })
    expect(report.geometry).toEqual({
      parts: [
        {
          kind: 'mesh',
          name: 'main.scad',
          bounds: { min: [0, 0, 0], max: [10, 20, 30] },
          vertexCount: 8,
          faceCount: 6,
        },
      ],
      overall: null,
    })
    expect(report.durationMs).toBeGreaterThanOrEqual(0)
    expect(
      await fs.readFile(path.join(projectDirectory, 'main.scad'), 'utf8'),
    ).toContain('old disk source')
  },
)

nativeTest(
  'ordinary and appearance-only builds omit geometry, while successful warnings reach the agent',
  async () => {
    const { wrapper, projectDirectory } = await fixture()
    const source = 'unknown_module(); cube(2);'
    const report = await wrapper.buildForAgent({
      file: 'main.scad',
      projectDirectory,
      source,
    })
    expect(report.status).toBe('succeeded')
    expect(report).not.toHaveProperty('geometry')
    expect(
      report.logs.some(
        (log) =>
          log.level === 'warn' &&
          log.text.includes("Ignoring unknown module 'unknown_module'"),
      ),
    ).toBe(true)
    const preview = await wrapper.execute({
      action: 'compile',
      main: { path: '/main.scad', code: source },
      overrides: { '/main.scad': { content: source } },
      projectDirectory,
    })
    expect(preview.error).toBe(false)
    expect(preview.format).toBe('off')
    expect(preview).not.toHaveProperty('geometry')
  },
)

nativeTest(
  '2D summaries use model bounds rather than the padded SVG viewport',
  async () => {
    const { wrapper, projectDirectory } = await fixture()
    const report = await wrapper.buildForAgent({
      file: 'main.scad',
      projectDirectory,
      source: 'translate([5,-3]) square([10,20]);',
      geometrySummary: true,
    })
    expect(report.status).toBe('succeeded')
    expect(report.shapes).toEqual([
      { name: 'main.scad', kind: '2d', rendered: true },
    ])
    expect(report.geometry.parts).toEqual([
      {
        kind: '2d',
        name: 'main.scad',
        bounds: { min: [5, -3], max: [15, 17] },
      },
    ])
  },
)

nativeTest(
  'main-file assertions have original source lines; included errors retain their filename',
  async () => {
    const { wrapper, projectDirectory } = await fixture()
    const report = await wrapper.buildForAgent({
      file: 'main.scad',
      projectDirectory,
      source: 'echo("before");\nassert(false,"bad dimensions");\ncube(2);',
    })
    expect(report.status).toBe('failed')
    expect(report.error.line).toBe(2)
    expect(report.error.message).toContain('bad dimensions')
    expect(report.error.message).not.toContain('/temp/run-')
    await fs.writeFile(
      path.join(projectDirectory, 'bad.scad'),
      'assert(false,"included failure");',
    )
    const imported = await wrapper.buildForAgent({
      file: 'main.scad',
      projectDirectory,
      source: 'include <bad.scad>; cube(2);',
    })
    expect(imported.status).toBe('failed')
    expect(imported.error.message).toContain('/bad.scad')
    expect(imported.error).not.toHaveProperty('line')
  },
)

nativeTest(
  'syntax errors and empty geometry fail instead of reporting an empty success',
  async () => {
    const { wrapper, projectDirectory } = await fixture()
    for (const source of ['cube([1,2,3]', 'difference(){cube(2);cube(3);}']) {
      const report = await wrapper.buildForAgent({
        file: 'main.scad',
        projectDirectory,
        source,
      })
      expect(report.status).toBe('failed')
    }
  },
)

nativeTest(
  'agent outputs cannot overwrite a mirrored project file named out.off',
  async () => {
    const { wrapper, projectDirectory } = await fixture()
    await fs.writeFile(
      path.join(projectDirectory, 'out.off'),
      'keep project asset',
    )
    expect(
      (
        await wrapper.buildForAgent({
          file: 'main.scad',
          projectDirectory,
          source: 'cube(2);',
        })
      ).status,
    ).toBe('succeeded')
    expect(
      await fs.readFile(path.join(projectDirectory, 'out.off'), 'utf8'),
    ).toBe('keep project asset')
  },
)

test('missing compiler and cancelled builds are unavailable rather than model failures', async () => {
  const { directory, projectDirectory, wrapper } = await fixture()
  const request = { file: 'main.scad', projectDirectory, source: 'cube(2);' }
  expect(
    (
      await new OpenSCADWrapper(
        path.join(directory, 'missing'),
        directory,
      ).buildForAgent(request)
    ).status,
  ).toBe('unavailable')
  const controller = new AbortController()
  controller.abort(new Error('project closed'))
  expect(await wrapper.buildForAgent(request, controller.signal)).toEqual({
    status: 'unavailable',
    reason: 'project closed',
  })
})

test('OFF summaries handle legal headers and reject malformed geometry', () => {
  const mesh = 'OFF\n3 1 0\n0 0 0\n10 0 0\n0 20 0\n3 0 1 2 255 0 0 255\n'
  expect(summarizeOff(mesh, 'test').bounds).toEqual({
    min: [0, 0, 0],
    max: [10, 20, 0],
  })
  expect(summarizeOff(mesh.replace('OFF\n', 'OFF '), 'test').faceCount).toBe(1)
  for (const broken of [
    mesh.replace('3 0 1 2', '3 0 1 7'),
    mesh.replace('10 0 0', 'Infinity 0 0'),
    mesh.replace('3 1 0', '3.5 1 0'),
    mesh.replace('3 1 0', '3 2 0'),
    '',
  ])
    expect(() => summarizeOff(broken, 'test')).toThrow()
  expect(() =>
    summarizeDrawing(
      {
        geometry: {
          dimensions: 2,
          bounding_box: { min: [10, 0], max: [0, 20] },
        },
      },
      'test',
    ),
  ).toThrow()
})

nativeTest(
  'nested main filenames retain correct diagnostics and source snapshot semantics',
  async () => {
    const { wrapper, projectDirectory } = await fixture()
    const file = 'nested/model, v1.scad'
    const report = await wrapper.buildForAgent({
      file,
      projectDirectory,
      source: 'echo("nested");\nassert(false,"nested error");',
    })
    expect(report.status).toBe('failed')
    expect(report.error.line).toBe(2)
    expect(report.error.message).toContain('/' + file)
  },
)

test.skipIf(process.platform !== 'linux' || !Bun.which('python3'))(
  'cancellation kills the active compiler and cleans staged source',
  async () => {
    const { directory, projectDirectory } = await fixture()
    const fakeResources = path.join(directory, 'fake')
    const fakeBinary = path.join(
      fakeResources,
      'bin/OpenSCAD.AppDir/usr/bin/openscad',
    )
    const pidPath = path.join(directory, 'pid')
    await fs.mkdir(path.dirname(fakeBinary), { recursive: true })
    await fs.writeFile(
      fakeBinary,
      '#!' +
        Bun.which('python3') +
        '\nimport os,time\nopen(' +
        JSON.stringify(pidPath) +
        ', "w").write(str(os.getpid()))\ntime.sleep(30)\n',
      { mode: 0o755 },
    )
    const controller = new AbortController()
    const pending = new OpenSCADWrapper(fakeResources, directory).buildForAgent(
      { file: 'main.scad', projectDirectory, source: 'cube(2);' },
      controller.signal,
    )
    for (let attempt = 0; attempt < 200 && !existsSync(pidPath); attempt++)
      await Bun.sleep(5)
    expect(existsSync(pidPath)).toBe(true)
    const pid = Number(await fs.readFile(pidPath, 'utf8'))
    controller.abort(new Error('window closed'))
    expect(await pending).toEqual({
      status: 'unavailable',
      reason: 'window closed',
    })
    expect(() => process.kill(pid, 0)).toThrow()
    expect(await fs.readdir(path.join(directory, 'temp'))).toEqual([])
  },
)

test.skipIf(process.platform !== 'linux' || !Bun.which('python3'))(
  'compiler diagnostics are assembled before splitting lines and decoding UTF-8',
  async () => {
    const { directory, projectDirectory } = await fixture()
    const fakeResources = path.join(directory, 'fake')
    const fakeBinary = path.join(
      fakeResources,
      'bin/OpenSCAD.AppDir/usr/bin/openscad',
    )
    await fs.mkdir(path.dirname(fakeBinary), { recursive: true })
    await fs.writeFile(
      fakeBinary,
      '#!' +
        Bun.which('python3') +
        '\nimport sys,time\nsys.stderr.buffer.write(b\'ECHO: "h\\xc3\');sys.stderr.flush();time.sleep(0.03)\nsys.stderr.buffer.write(b\'\\xa9llo"\\nWARNING: split warning in file main.scad, line 1\\n\');sys.stderr.flush()\nopen(sys.argv[sys.argv.index("-o")+1],"w").write("OFF\\n3 1 0\\n0 0 0\\n1 0 0\\n0 1 0\\n3 0 1 2\\n")\n',
      { mode: 0o755 },
    )
    const report = await new OpenSCADWrapper(
      fakeResources,
      directory,
    ).buildForAgent({ file: 'main.scad', projectDirectory, source: 'cube(2);' })
    expect(report.status).toBe('succeeded')
    expect(report.logs).toEqual([
      { level: 'log', text: 'ECHO: "héllo"' },
      {
        level: 'warn',
        text: 'WARNING: split warning in file /main.scad, line 1',
      },
    ])
  },
)

nativeTest(
  'echoed ERROR text is a log rather than a compiler failure',
  async () => {
    const { wrapper, projectDirectory } = await fixture()
    const report = await wrapper.buildForAgent({
      file: 'main.scad',
      projectDirectory,
      source: 'echo("ERROR: a model label"); cube(2);',
    })
    expect(report.status).toBe('succeeded')
    expect(report.logs).toContainEqual({
      level: 'log',
      text: 'ECHO: "ERROR: a model label"',
    })
  },
)

nativeTest('staging failures clean their temporary directory', async () => {
  const { wrapper, directory, projectDirectory } = await fixture()
  const report = await wrapper.buildForAgent({
    file: 'main.scad',
    projectDirectory: path.join(projectDirectory, 'missing'),
    source: 'cube(2);',
  })
  expect(report.status).toBe('unavailable')
  expect(await fs.readdir(path.join(directory, 'temp'))).toEqual([])
})
