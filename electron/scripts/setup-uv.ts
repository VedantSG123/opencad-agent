/**
 * Standalone setup script for the uv binary.
 * Runs before `bun run build` and `bun run dev` in electron/package.json.
 *
 * uv builds and populates the Python environment that build123d projects
 * compile in. It is a single static binary with no dependencies of its own, so
 * shipping it is a download and a copy.
 *
 * What it does:
 *   1. Detects the host platform and picks the matching release asset.
 *   2. Downloads it, verifying the SHA256 published beside it.
 *   3. Extracts the `uv` binary into electron/uv-bin/ for electron-builder.
 *
 * Only the host's binary is staged, so a packaged build only ever carries uv
 * for the platform it was built on - the build host must be the target host,
 * the same constraint the backend's native binaries carry.
 */

import { exec } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import https from 'node:https'
import { arch, platform } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

import { unzipSync } from 'fflate'

const execAsync = promisify(exec)

const UV_VERSION = '0.12.15'
const RELEASE_BASE = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}`

const TARGET_TRIPLES: Record<string, string> = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'win32-arm64': 'aarch64-pc-windows-msvc',
  'win32-x64': 'x86_64-pc-windows-msvc',
}

const SCRIPT_DIR = import.meta.dirname
const ELECTRON_ROOT_DIR = path.resolve(SCRIPT_DIR, '..')

const TEMP_DIR = path.join(ELECTRON_ROOT_DIR, 'temp')
const UV_BIN_DIR = path.join(ELECTRON_ROOT_DIR, 'uv-bin')
const VERSION_MARKER = path.join(UV_BIN_DIR, '.uv-version')

function detectTarget(): { triple: string; isWindows: boolean } {
  const key = `${platform()}-${arch()}`
  const triple = TARGET_TRIPLES[key]
  if (!triple) {
    throw new Error(`[setup-uv] uv publishes no binary for ${key}`)
  }
  return { triple, isWindows: platform() === 'win32' }
}

function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (
          response.statusCode === 301 ||
          response.statusCode === 302 ||
          response.statusCode === 307 ||
          response.statusCode === 308
        ) {
          if (response.headers.location) {
            downloadFile(response.headers.location, outputPath)
              .then(resolve)
              .catch(reject)
            return
          }
        }
        if (response.statusCode !== 200) {
          reject(
            new Error(`Download failed with status ${response.statusCode}`),
          )
          return
        }
        const fileStream = createWriteStream(outputPath)
        pipeline(response, fileStream).then(resolve).catch(reject)
      })
      .on('error', reject)
  })
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (
          response.statusCode === 301 ||
          response.statusCode === 302 ||
          response.statusCode === 307 ||
          response.statusCode === 308
        ) {
          if (response.headers.location) {
            fetchText(response.headers.location).then(resolve).catch(reject)
            return
          }
        }
        if (response.statusCode !== 200) {
          reject(
            new Error(`Download failed with status ${response.statusCode}`),
          )
          return
        }
        let body = ''
        response.setEncoding('utf-8')
        response.on('data', (chunk) => (body += chunk))
        response.on('end', () => resolve(body))
      })
      .on('error', reject)
  })
}

/** We run what we download, so the hash is checked before anything executes. */
async function verifyChecksum(filePath: string, assetUrl: string) {
  // The published file is one line of `<sha256>  <filename>`.
  const published = (await fetchText(`${assetUrl}.sha256`))
    .trim()
    .split(/\s+/)[0]
  const actual = createHash('sha256')
    .update(await fs.readFile(filePath))
    .digest('hex')

  if (actual !== published) {
    throw new Error(
      `[setup-uv] checksum mismatch\n  expected ${published}\n  actual   ${actual}`,
    )
  }
  console.log('[setup-uv] Checksum verified')
}

/** The Windows zip holds uv.exe, uvw.exe and uvx.exe flat at its root. */
async function extractWindowsZip(archivePath: string) {
  const entries = unzipSync(new Uint8Array(await fs.readFile(archivePath)))
  const binary = entries['uv.exe']
  if (!binary) {
    throw new Error('[setup-uv] uv.exe missing from the downloaded archive')
  }
  await fs.writeFile(path.join(UV_BIN_DIR, 'uv.exe'), binary)
}

/** The tarballs nest their files under a directory named for the triple. */
async function extractUnixTarball(archivePath: string, triple: string) {
  await execAsync(
    `tar -xzf "${archivePath}" -C "${UV_BIN_DIR}" --strip-components=1 "uv-${triple}/uv"`,
  )
  await fs.chmod(path.join(UV_BIN_DIR, 'uv'), 0o755)
}

async function main() {
  const { triple, isWindows } = detectTarget()
  const binaryName = isWindows ? 'uv.exe' : 'uv'
  const binaryPath = path.join(UV_BIN_DIR, binaryName)

  const staged = existsSync(VERSION_MARKER)
    ? (await fs.readFile(VERSION_MARKER, 'utf-8')).trim()
    : null

  if (staged === UV_VERSION && existsSync(binaryPath)) {
    console.log(`[setup-uv] uv ${UV_VERSION} already staged at ${binaryPath}`)
    return
  }

  const asset = isWindows ? `uv-${triple}.zip` : `uv-${triple}.tar.gz`
  const assetUrl = `${RELEASE_BASE}/${asset}`
  const archivePath = path.join(TEMP_DIR, asset)

  await fs.mkdir(TEMP_DIR, { recursive: true })
  await fs.mkdir(UV_BIN_DIR, { recursive: true })

  console.log(`[setup-uv] Downloading ${assetUrl}`)
  await downloadFile(assetUrl, archivePath)
  await verifyChecksum(archivePath, assetUrl)

  if (isWindows) {
    await extractWindowsZip(archivePath)
  } else {
    await extractUnixTarball(archivePath, triple)
  }
  await fs.rm(archivePath, { force: true })

  const { stdout } = await execAsync(`"${binaryPath}" --version`)
  await fs.writeFile(VERSION_MARKER, UV_VERSION)
  console.log(`[setup-uv] Staged ${stdout.trim()} at ${binaryPath}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
