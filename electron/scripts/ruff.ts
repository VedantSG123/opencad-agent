import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const isWindows = process.platform === 'win32'
const interpreter = path.join(
  root,
  '.venv',
  isWindows ? 'Scripts' : 'bin',
  isWindows ? 'python.exe' : 'python',
)
const result = spawnSync(
  interpreter,
  ['-m', 'ruff', ...process.argv.slice(2)],
  {
    cwd: root,
    stdio: 'inherit',
  },
)

if (result.error) {
  process.stderr.write(
    `${result.error.message}\nRun bun run setup:python first.\n`,
  )
  process.exitCode = 1
} else if (result.signal) {
  process.kill(process.pid, result.signal)
} else {
  process.exitCode = result.status ?? 1
}
