import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, watch } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { runPython } from '../../src/utils/cad/build123d/process'

const directories = []
const python = Bun.which('python3') ?? Bun.which('python')

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function fixture(source) {
  const cwd = await mkdtemp(join(tmpdir(), 'build123d-process-'))
  directories.push(cwd)
  const entry = join(cwd, 'runner.py')
  await writeFile(entry, source)
  return {
    interpreter: python,
    entry,
    args: [],
    cwd,
    parseResult: (value) => value,
  }
}

function waitForFile(file) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      watcher.close()
      reject(new Error(`The script did not create ${file}`))
    }, 2000)
    const complete = () => {
      if (!existsSync(file) || !readFileSync(file, 'utf-8').trim()) return
      watcher.close()
      clearTimeout(timeout)
      resolve()
    }
    const watcher = watch(dirname(file), complete)
    watcher.on('error', (error) => {
      clearTimeout(timeout)
      watcher.close()
      reject(error)
    })
    complete()
  })
}

async function alive(pid) {
  try {
    process.kill(pid, 0)
    if (process.platform === 'linux') {
      const status = await readFile(`/proc/${pid}/stat`, 'utf-8')
      const state = status.slice(
        status.lastIndexOf(')') + 2,
        status.lastIndexOf(')') + 3,
      )
      return state !== 'Z' && state !== 'X'
    }
    return true
  } catch {
    return false
  }
}

async function exited(pid) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!(await alive(pid))) return true
    await Bun.sleep(10)
  }
  return false
}

describe.skipIf(!python)('Python process lifecycle', () => {
  test('a nonzero exit fails even when stdout contains a complete success result', async () => {
    const request = await fixture(
      'import json,sys\nprint(json.dumps({"ok":True,"logs":"forged success","duration":0,"instances":[],"shapes":{"name":"model","id":"root","parts":[]}}))\nprint("native failure after output", file=sys.stderr)\nsys.exit(7)',
    )
    await expect(
      runPython({ ...request, signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      code: 'RUNNER_FAILED',
      message: 'native failure after output',
    })
  })

  test('invalid result fields are diagnosed by the required result parser', async () => {
    const request = await fixture('print("{\\\"ok\\\": true}")')
    await expect(
      runPython({
        ...request,
        signal: new AbortController().signal,
        parseResult: () => {
          throw new Error('instances: expected an array')
        },
      }),
    ).rejects.toMatchObject({
      code: 'RUNNER_OUTPUT_INVALID',
      message:
        'The Python runner returned an invalid result: instances: expected an array',
    })
  })

  test('a rejected result does not prevent the next subprocess from succeeding', async () => {
    const request = await fixture('print("null")')
    const options = {
      ...request,
      signal: new AbortController().signal,
      parseResult: (value) => {
        if (value !== 'recovered') throw new Error('expected recovered result')
        return value
      },
    }
    await expect(runPython(options)).rejects.toMatchObject({
      code: 'RUNNER_OUTPUT_INVALID',
    })
    await writeFile(request.entry, 'print(\'"recovered"\')')
    expect(await runPython(options)).toBe('recovered')
  })

  test('an already cancelled request does not execute its script', async () => {
    const request = await fixture(
      'import json\nopen("executed", "w").close()\nprint(json.dumps({"ok":True,"logs":"executed","duration":0,"instances":[],"shapes":{"name":"model","id":"root","parts":[]}}))',
    )
    const controller = new AbortController()
    controller.abort()
    await expect(
      runPython({ ...request, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'BUILD_CANCELLED' })
    expect(existsSync(join(request.cwd, 'executed'))).toBe(false)
  })

  test('timeout is reported independently of child exit', async () => {
    const request = await fixture(
      'import json,time\ntime.sleep(0.2)\nprint(json.dumps({"ok":True,"logs":"too late","duration":0,"instances":[],"shapes":{"name":"model","id":"root","parts":[]}}))',
    )
    await expect(
      runPython({
        ...request,
        signal: new AbortController().signal,
        timeoutMs: 20,
      }),
    ).rejects.toMatchObject({ code: 'BUILD_TIMEOUT' })
  })

  test('successful runs receive their own environment and complete payload', async () => {
    const request = await fixture(`import json,os
print(json.dumps({"ok": False, "error": "script failure", "logs": "|".join([os.environ["OPENCAD_OVERRIDES_PATH"], os.environ["OPENCAD_SYS_PATH"], os.environ["PYTHONDONTWRITEBYTECODE"]]), "duration": 0.5}))`)
    const result = await runPython({
      ...request,
      signal: new AbortController().signal,
      overridesPath: 'my-overrides.json',
    })
    expect(result).toEqual({
      ok: false,
      error: 'script failure',
      logs: `my-overrides.json|${request.cwd}|1`,
      duration: 0.5,
    })
  })

  test.skipIf(process.platform === 'win32')(
    'cancellation escalates when the script ignores SIGTERM',
    async () => {
      const request = await fixture(`import os,signal,time
signal.signal(signal.SIGTERM, signal.SIG_IGN)
with open("ready", "w") as handle: handle.write(str(os.getpid()))
while True: time.sleep(1)`)
      const ready = waitForFile(join(request.cwd, 'ready'))
      const controller = new AbortController()
      const settled = runPython({ ...request, signal: controller.signal }).then(
        () => ({ status: 'resolved' }),
        (reason) => ({ status: 'rejected', code: reason.code }),
      )
      let pid
      try {
        await ready
        pid = Number(await readFile(join(request.cwd, 'ready'), 'utf-8'))
      } finally {
        controller.abort()
        await settled
      }
      expect(await settled).toEqual({
        status: 'rejected',
        code: 'BUILD_CANCELLED',
      })
      expect(await exited(pid)).toBe(true)
    },
  )

  test.skipIf(process.platform === 'win32')(
    'cancellation kills a descendant even after its parent exits',
    async () => {
      const request = await fixture(`import subprocess,sys,time
subprocess.Popen([sys.executable, "-c", "import os,signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); open('descendant', 'w').write(str(os.getpid())); time.sleep(60)"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
while True: time.sleep(1)`)
      const ready = waitForFile(join(request.cwd, 'descendant'))
      const controller = new AbortController()
      const settled = runPython({ ...request, signal: controller.signal }).then(
        () => ({ status: 'resolved' }),
        (reason) => ({ status: 'rejected', code: reason.code }),
      )
      let pid
      try {
        await ready
        pid = Number(await readFile(join(request.cwd, 'descendant'), 'utf-8'))
      } finally {
        controller.abort()
        await settled
      }
      expect(await settled).toEqual({
        status: 'rejected',
        code: 'BUILD_CANCELLED',
      })
      expect(await exited(pid)).toBe(true)
    },
  )

  test('spawn errors and invalid output do not wait for the build timeout', async () => {
    const request = await fixture('print("not JSON")')
    await expect(
      runPython({ ...request, signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'RUNNER_OUTPUT_INVALID' })
    await expect(
      runPython({
        ...request,
        interpreter: join(request.cwd, 'missing-python'),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
