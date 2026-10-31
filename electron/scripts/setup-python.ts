import { spawn } from 'node:child_process'
import path from 'node:path'

import { PYTHON_INSTALL_SPECS, PYTHON_VERSION } from 'shared/python'

const root = path.resolve(import.meta.dirname, '../..')
const environment = path.join(root, '.venv')
const isWindows = process.platform === 'win32'
const uv = path.join(root, 'electron', 'uv-bin', isWindows ? 'uv.exe' : 'uv')
const interpreter = path.join(
  environment,
  isWindows ? 'Scripts' : 'bin',
  isWindows ? 'python.exe' : 'python',
)

function runUv(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(uv, args, {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        UV_PYTHON_INSTALL_DIR: path.join(root, '.python'),
        UV_CACHE_DIR: path.join(root, '.cache', 'uv'),
      },
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolve()
      else {
        reject(
          new Error(
            `uv ${args[0]} failed (${signal ? `signal ${signal}` : `exit ${code}`}).`,
          ),
        )
      }
    })
  })
}

async function main(): Promise<void> {
  await runUv([
    'python',
    'install',
    PYTHON_VERSION,
    '--no-bin',
    '--no-registry',
  ])
  await runUv([
    'venv',
    environment,
    '--python',
    PYTHON_VERSION,
    '--managed-python',
    '--allow-existing',
  ])
  await runUv([
    'pip',
    'install',
    '--python',
    interpreter,
    '--compile-bytecode',
    ...PYTHON_INSTALL_SPECS,
  ])
  process.stdout.write(`Python development environment ready: ${interpreter}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exitCode = 1
})
