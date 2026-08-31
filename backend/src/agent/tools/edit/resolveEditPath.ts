import type { Stats } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'

import { isWithin } from '../../../utils/paths'
import type { PathGuard } from '../../permissions/pathGuard'

export type ResolvedEditTarget = {
  absolutePath: string
  displayPath: string
  sizeBytes: number
}

/**
 * The file an edit would write to, once the policy has agreed to it. Asks for
 * `write` rather than `read`: a grant to read a directory must not be enough to
 * change what is in it.
 */
export async function resolveEditPath(
  root: string,
  requested: string,
  guard: PathGuard,
  toolCallId?: string,
): Promise<ResolvedEditTarget | { error: string }> {
  const trimmed = requested.trim()
  if (trimmed === '') {
    return { error: 'Error: `path` must name a file to edit.' }
  }

  const target = path.resolve(root, trimmed)

  const refusal = guard.refusalFor(target, 'write', toolCallId)
  if (refusal) return { error: `Error: ${refusal}` }

  if (target === path.resolve(root)) {
    return { error: `Error: "${requested}" is the project directory itself.` }
  }

  const displayPath = toDisplayPath(root, target)

  const stats = await statOrNull(target)
  if (!stats) {
    return {
      error: `Error: file not found: ${displayPath}. Edit changes an existing file; use create to make a new one.`,
    }
  }
  if (stats.isDirectory()) {
    return { error: `Error: ${displayPath} is a directory, not a file.` }
  }
  if (!stats.isFile()) {
    return {
      error: `Error: ${displayPath} is not a regular file, so it cannot be edited.`,
    }
  }

  // A write follows a symlink to whatever it points at, so the file that would
  // actually change has to clear the policy too.
  const realTarget = await realPathOrSelf(target)
  if (realTarget !== target) {
    const realRefusal = guard.refusalFor(realTarget, 'write', toolCallId)
    if (realRefusal) return { error: `Error: ${realRefusal}` }
  }

  return {
    absolutePath: target,
    displayPath,
    sizeBytes: stats.size,
  }
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
