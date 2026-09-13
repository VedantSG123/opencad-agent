import type { Stats } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'

import { isWithin } from '../../../utils/paths'
import type { PathGuard } from '../../permissions/pathGuard'

export type ResolvedFile = {
  absolutePath: string
  displayPath: string
  sizeBytes: number
}

export async function resolveFilePath(
  root: string,
  requested: string,
  guard: PathGuard,
  toolCallId?: string,
): Promise<ResolvedFile | { error: string }> {
  const trimmed = requested.trim()
  if (trimmed === '') {
    return { error: 'Error: `path` must name a file to read.' }
  }

  const target = path.resolve(root, trimmed)

  const refusal = guard.refusalFor(target, 'read', toolCallId)
  if (refusal) return { error: `Error: ${refusal}` }

  if (target === path.resolve(root)) {
    return { error: `Error: "${requested}" is the project directory itself.` }
  }

  const displayPath = toDisplayPath(root, target)

  const stats = await statOrNull(target)
  if (!stats) {
    return { error: `Error: file not found: ${displayPath}` }
  }
  if (stats.isDirectory()) {
    return {
      error: `Error: ${displayPath} is a directory, not a file. Use grep to search inside it.`,
    }
  }
  if (!stats.isFile()) {
    return {
      error: `Error: ${displayPath} is not a regular file, so it cannot be read.`,
    }
  }

  // The path the model asked for and the file behind it are different facts:
  // a symlink can carry either outside the project or onto something the
  // policy blocks by name, and only the resolved path shows it.
  const realTarget = await realPathOrSelf(target)
  if (realTarget !== target) {
    const realRefusal = guard.refusalFor(realTarget, 'read', toolCallId)
    if (realRefusal) return { error: `Error: ${realRefusal}` }
  }

  return {
    absolutePath: target,
    displayPath,
    sizeBytes: stats.size,
  }
}

export async function isDirectory(target: string): Promise<boolean> {
  const stats = await statOrNull(target)
  return stats !== null && stats.isDirectory()
}

/** Project files stay relative and readable; approved outside files show in full. */
function toDisplayPath(root: string, target: string): string {
  return isWithin(root, target)
    ? path.relative(root, target).split(path.sep).join('/')
    : target
}

async function statOrNull(target: string): Promise<Stats | null> {
  try {
    return await stat(target)
  } catch {
    return null
  }
}

async function realPathOrSelf(target: string): Promise<string> {
  try {
    return await realpath(target)
  } catch {
    return target
  }
}
