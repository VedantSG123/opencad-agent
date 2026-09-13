import type { PermissionAccess, PermissionRule } from 'shared'

import { isWithin } from '../../utils/paths'
import { deniedPathReason } from './builtin/deniedPaths'
import { evaluatePath } from './evaluate'
import { onceGrantedPaths } from './rules/onceGrants'

export type PathGuard = {
  /**
   * `null` when the path may be touched for this access, otherwise the reason
   * it may not. Ask about the path actually being opened - after `realpath` -
   * since that is the fact the policy could not see before the call ran.
   */
  refusalFor(
    absolutePath: string,
    access: PermissionAccess,
    toolCallId?: string,
  ): string | null
}

export type PathGuardOptions = {
  tool: string
  projectDirectory: string
  sessionId: string
  /** Read fresh on every check, so a grant applies from the next call onwards. */
  currentRules: () => PermissionRule[]
}

export function createPathGuard({
  tool,
  projectDirectory,
  sessionId,
  currentRules,
}: PathGuardOptions): PathGuard {
  return {
    refusalFor(absolutePath, access, toolCallId) {
      const decision = evaluatePath(absolutePath, access, {
        tool,
        projectDirectory,
        rules: currentRules(),
      })

      if (decision === 'allow') return null
      if (decision === 'deny') {
        const reason =
          deniedPathReason(absolutePath) ?? 'a permission rule denies it'
        return `${absolutePath} cannot be accessed: ${reason}.`
      }

      // Nothing standing settles it, so only a warrant issued for this very
      // call can - that is what "allow once" leaves behind.
      const warranted =
        toolCallId !== undefined &&
        onceGrantedPaths(sessionId, toolCallId).some((granted) =>
          isWithin(granted, absolutePath),
        )

      return warranted
        ? null
        : `${absolutePath} is outside the project directory and has not been approved for ${access} access.`
    },
  }
}

/**
 * The default when no policy is wired in: the project directory and nothing
 * else. Callers that forget to pass a guard get containment, never freedom.
 */
export function projectPathGuard(projectDirectory: string): PathGuard {
  return createPathGuard({
    tool: '*',
    projectDirectory,
    sessionId: '',
    currentRules: () => [],
  })
}
