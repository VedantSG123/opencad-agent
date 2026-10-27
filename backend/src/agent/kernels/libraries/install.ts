import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Written last, so its presence means every other file is in place. */
const COMPLETE_MARKER = '.installed'

/**
 * Writes `files` into `directory` once. A directory without the marker is a
 * half-finished install, and is replaced rather than trusted.
 */
export async function installLibrary(
  directory: string,
  files: Record<string, string>,
): Promise<void> {
  if (await exists(path.join(directory, COMPLETE_MARKER))) return

  // Staged beside the target and renamed into place, so a crash mid-write
  // never leaves a directory that looks installed.
  const staging = `${directory}.staging-${process.pid}`
  await rm(staging, { recursive: true, force: true })

  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(staging, relative)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content, 'utf-8')
  }
  await writeFile(path.join(staging, COMPLETE_MARKER), '', 'utf-8')

  await rm(directory, { recursive: true, force: true })
  try {
    await rename(staging, directory)
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    // Another backend process finished the same install first.
    if (await exists(path.join(directory, COMPLETE_MARKER))) return
    throw error
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}
