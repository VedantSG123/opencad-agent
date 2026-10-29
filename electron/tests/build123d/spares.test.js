import { afterEach, describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PreviewSpares } from '../../src/utils/cad/build123d/spares'

const python = Bun.which('python3') ?? Bun.which('python')
const directories = []
const owners = []

afterEach(async () => {
  await Promise.all(owners.splice(0).map((spares) => spares.discardAll()))
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

const ENTRY = `import builtins, json, os, sys, time
open(os.path.join(os.path.dirname(__file__), f"started-{os.getpid()}"), "w").close()
request = json.load(sys.stdin)
while request["script"] == "hold" and not os.path.exists(os.path.join(os.path.dirname(__file__), "release")):
    time.sleep(0.01)
builtins.builds = getattr(builtins, "builds", 0) + 1
print(json.dumps({"pid": os.getpid(), "builds": builtins.builds, "executable": sys.executable}))
`

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'build123d-spares-'))
  directories.push(directory)
  const entry = join(directory, 'runner.py')
  await writeFile(entry, ENTRY)
  const spares = new PreviewSpares(() => entry)
  owners.push(spares)
  return { directory, spares }
}

function started(directory) {
  return readdirSync(directory)
    .filter((name) => name.startsWith('started-'))
    .map((name) => Number(name.slice('started-'.length)))
}

async function waitFor(condition, what) {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (condition()) return
    await Bun.sleep(10)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function build(process, { script = 'main.py', signal } = {}) {
  return process.run({
    input: { script, cwd: tmpdir(), sysPath: [], overridesPath: null },
    signal: signal ?? new AbortController().signal,
    parseResult: (value) => value,
  })
}

describe.skipIf(!python)('Preview spares', () => {
  test('a build after the first runs in a process started before it was asked for', async () => {
    const { directory, spares } = await setup()
    await build(spares.take(1, python))
    await waitFor(() => started(directory).length === 2, 'the spare to start')
    const before = started(directory)

    const result = await build(spares.take(1, python))

    expect(before).toContain(result.pid)
  })

  test('taking a spare starts the next one while the build runs', async () => {
    const { directory, spares } = await setup()
    await build(spares.take(1, python))
    await waitFor(() => started(directory).length === 2, 'the spare to start')

    const running = build(spares.take(1, python), { script: 'hold' })

    await waitFor(
      () => started(directory).length === 3,
      'the next spare to start',
    )
    await writeFile(join(directory, 'release'), '')
    await running
  })

  test('a build replaced while running leaves one spare, not two', async () => {
    const { directory, spares } = await setup()
    const controller = new AbortController()
    const replaced = build(spares.take(1, python), {
      script: 'hold',
      signal: controller.signal,
    })
    await waitFor(
      () => started(directory).length === 2,
      'the build and its spare to start',
    )
    const newer = build(spares.take(1, python))
    controller.abort()
    await replaced.catch(() => {})
    await newer

    await waitFor(() => started(directory).length === 3, 'the spare to start')
    await Bun.sleep(200)
    expect(started(directory).filter((pid) => alive(pid))).toHaveLength(1)
  })

  test('every build gets a fresh interpreter', async () => {
    const { spares } = await setup()
    const first = await build(spares.take(1, python))
    const second = await build(spares.take(1, python))

    expect(first.builds).toBe(1)
    expect(second.builds).toBe(1)
    expect(second.pid).not.toBe(first.pid)
  })

  test('a spare started for another interpreter is not used and is stopped', async () => {
    const { directory, spares } = await setup()
    const other = join(directory, 'other-python')
    await symlink(python, other)
    await build(spares.take(1, python))
    await waitFor(() => started(directory).length === 2, 'the spare to start')
    const stale = started(directory).find((pid) => alive(pid))

    const result = await build(spares.take(1, other))

    expect(result.executable).toBe(other)
    expect(result.pid).not.toBe(stale)
    await waitFor(() => !alive(stale), 'the stale spare to stop')
  })

  test('discarding an owner stops its spare and leaves other owners alone', async () => {
    const { directory, spares } = await setup()
    await build(spares.take(1, python))
    await build(spares.take(2, python))
    await waitFor(() => started(directory).length === 4, 'both spares to start')
    const live = started(directory).filter((pid) => alive(pid))
    expect(live).toHaveLength(2)

    await spares.discardOwner(1)

    await waitFor(
      () => started(directory).filter((pid) => alive(pid)).length === 1,
      'one spare to stop',
    )
    const survivor = await build(spares.take(2, python))
    expect(live).toContain(survivor.pid)
  })

  test('a spare that died while idle is replaced rather than handed out', async () => {
    const { directory, spares } = await setup()
    await build(spares.take(1, python))
    await waitFor(() => started(directory).length === 2, 'the spare to start')
    const spare = started(directory).find((pid) => alive(pid))
    process.kill(spare, 'SIGKILL')
    await waitFor(() => !alive(spare), 'the spare to die')

    const result = await build(spares.take(1, python))

    expect(result.pid).not.toBe(spare)
    expect(result.builds).toBe(1)
  })

  test('nothing is left running after discardAll', async () => {
    const { directory, spares } = await setup()
    await build(spares.take(1, python))
    await waitFor(() => started(directory).length === 2, 'the spare to start')

    await spares.discardAll()

    await waitFor(
      () => started(directory).every((pid) => !alive(pid)),
      'every process to stop',
    )
  })
})
