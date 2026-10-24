import path from 'node:path'

import type { PermissionAccess } from 'shared'

import { isWithin } from '../../../utils/paths'
import { LIBRARIES_DIR } from '../../kernels/libraries/directory'

export const LIBRARY_WRITE_REASON =
  'it is a library the app installs for reference, and is read-only'

/**
 * The libraries the app installs exist for the agent to read, so reading one
 * needs no question; writing one would change the reference for every
 * project, so no grant can allow it. `null` for any other path.
 */
export function libraryPathDecision(
  absolutePath: string,
  access: PermissionAccess,
): 'allow' | 'deny' | null {
  if (!isWithin(LIBRARIES_DIR, path.resolve(absolutePath))) return null
  return access === 'read' ? 'allow' : 'deny'
}
