import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const ASSETS_DIR = path.join(import.meta.dir, '..', 'dist', 'assets')

async function addRipgrepBinary(): Promise<void> {
  const binaryName = process.platform === 'win32' ? 'rg.exe' : 'rg'

  let source: string
  try {
    // @vscode/ripgrep throws at module scope when the optional dependency for
    // this platform/arch is not installed.
    source = (await import('@vscode/ripgrep')).rgPath
  } catch (error) {
    throw new Error(
      `@vscode/ripgrep has no binary for ${process.platform}-${process.arch}. Run \`bun install\` on this machine.`,
      { cause: error },
    )
  }

  const destination = path.join(ASSETS_DIR, binaryName)
  copyFileSync(source, destination)
  // copyFileSync does not carry the source mode across, and rg is spawned.
  chmodSync(destination, 0o755)
  assertRunnable(destination)

  console.log(`staged ${binaryName} from @vscode/ripgrep`)
}

function assertRunnable(binaryPath: string): void {
  const { error, status } = spawnSync(binaryPath, ['--version'], {
    stdio: 'ignore',
    windowsHide: true,
  })

  if (error || status !== 0) {
    throw new Error(
      `${binaryPath} does not run on ${process.platform}-${process.arch}: ${error?.message ?? `exit code ${status}`}`,
    )
  }
}

// Wiped so a binary staged for another platform cannot survive into a build.
rmSync(ASSETS_DIR, { recursive: true, force: true })
mkdirSync(ASSETS_DIR, { recursive: true })

await addRipgrepBinary()
