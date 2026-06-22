import * as path from 'path'

import { AppError } from './ipc-utils.js'

const allowedWorkspaceRoots = new Set<string>()

export function validatePath(filePath: string): string {
  if (!filePath) {
    throw new AppError('INVALID_INPUT', 'Path is required')
  }
  const resolved = path.resolve(filePath)
  if (!path.isAbsolute(resolved)) {
    throw new AppError('INVALID_INPUT', 'Expected absolute path')
  }

  let allowed = false
  for (const root of allowedWorkspaceRoots) {
    const relative = path.relative(root, resolved)
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      allowed = true
      break
    }
  }

  if (!allowed) {
    throw new AppError(
      'ACCESS_DENIED',
      `Access Denied: Path is outside allowed workspaces: ${resolved}`,
    )
  }

  return resolved
}

export async function loadAllowedWorkspaceRoots(
  backendUrl: string,
): Promise<void> {
  try {
    const res = await fetch(`${backendUrl}/api/projects`)
    if (res.ok) {
      const projects = (await res.json()) as { directory: string }[]
      for (const p of projects) {
        if (p.directory) {
          allowedWorkspaceRoots.add(path.resolve(p.directory))
        }
      }
      console.log(
        `Loaded ${allowedWorkspaceRoots.size} allowed workspace roots from database.`,
      )
    }
  } catch (err) {
    console.error('Failed to load projects from backend database:', err)
  }
}

export function addAllowedRoot(directory: string): void {
  allowedWorkspaceRoots.add(path.resolve(directory))
}

export function getAllowedRootsCount(): number {
  return allowedWorkspaceRoots.size
}
