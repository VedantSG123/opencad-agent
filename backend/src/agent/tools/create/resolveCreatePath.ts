import type { Stats } from 'node:fs'
import { lstat, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

import { isWithin } from '../../../utils/paths'
import type { PathGuard } from '../../permissions/pathGuard'

export type ResolvedCreateTarget = {
  absolutePath: string
  displayPath: string
  /**
   * How to name the directories that have to be made before the file can be
   * written, or `null` when the one it goes in is already there.
   */
  missingDirectory: string | null
}

/**
 * The file a create would write, once the policy has agreed to it.
 *
 * Read and edit resolve links through the file itself; here there is no file
 * yet, so the nearest existing ancestor is what gets resolved. A directory
 * inside the project can be a link to anywhere, and the write follows it: a
 * `vendor` link pointing at `~/.ssh` would land the new file there while the
 * path asked for never left the project.
 */
export async function resolveCreatePath(
  root: string,
  requested: string,
  guard: PathGuard,
  toolCallId?: string,
): Promise<ResolvedCreateTarget | { error: string }> {
  const trimmed = requested.trim()
  if (trimmed === '') {
    return { error: 'Error: `path` must name a file to create.' }
  }

  const target = path.resolve(root, trimmed)

  const refusal = guard.refusalFor(target, 'write', toolCallId)
  if (refusal) return { error: `Error: ${refusal}` }

  if (target === path.resolve(root)) {
    return { error: `Error: "${requested}" is the project directory itself.` }
  }

  const displayPath = toDisplayPath(root, target)

  // `lstat`, not `stat`: a link with nothing behind it still occupies the name,
  // and writing would follow it instead of reporting the clash.
  const existing = await lstatOrNull(target)
  if (existing) {
    return {
      error: existing.isDirectory()
        ? `Error: ${displayPath} is an existing directory.`
        : `Error: ${displayPath} already exists. Create only makes a new file - read it and use edit to change it.`,
    }
  }

  const ancestor = await nearestExistingAncestor(target)
  if (ancestor === null) {
    return {
      error: `Error: nothing above ${displayPath} exists, so there is nowhere to create it.`,
    }
  }

  if (!ancestor.stats.isDirectory()) {
    return {
      error: `Error: ${toDisplayPath(root, ancestor.path)} is not a directory, so ${displayPath} cannot be created under it.`,
    }
  }

  const realAncestor = await realPathOrSelf(ancestor.path)
  if (realAncestor !== ancestor.path) {
    const realTarget = path.join(
      realAncestor,
      path.relative(ancestor.path, target),
    )
    const realRefusal = guard.refusalFor(realTarget, 'write', toolCallId)
    if (realRefusal) return { error: `Error: ${realRefusal}` }
  }

  const parent = path.dirname(target)

  return {
    absolutePath: target,
    displayPath,
    missingDirectory:
      ancestor.path === parent ? null : toDisplayPath(root, parent),
  }
}

/** Project files stay relative and readable; approved outside files show in full. */
function toDisplayPath(root: string, target: string): string {
  return isWithin(root, target)
    ? path.relative(root, target).split(path.sep).join('/')
    : target
}

/**
 * `null` only when the walk runs out of parents, which a path on a drive that
 * is not there does.
 */
async function nearestExistingAncestor(
  target: string,
): Promise<{ path: string; stats: Stats } | null> {
  let current = path.dirname(target)

  for (;;) {
    const stats = await statOrNull(current)
    if (stats) return { path: current, stats }

    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

async function statOrNull(target: string): Promise<Stats | null> {
  try {
    return await stat(target)
  } catch {
    return null
  }
}

async function lstatOrNull(target: string): Promise<Stats | null> {
  try {
    return await lstat(target)
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
