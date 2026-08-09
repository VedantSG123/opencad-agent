import { describeGrepAccess } from '../../tools/grep/permissions'
import { describeReadAccess } from '../../tools/read/permissions'
import type { ToolAccess } from './types'

/**
 * What a tool call would touch, or `null` for a tool nobody registered - which
 * the policy refuses, so a new tool cannot reach the filesystem unnoticed.
 */
export function describeToolAccess(
  tool: string,
  input: unknown,
): ToolAccess[] | null {
  switch (tool) {
    case 'read':
      return describeReadAccess(input)
    case 'grep':
      return describeGrepAccess(input)
    case 'applyDiff':
    case 'getApiDocumentation':
      return []
    default:
      return null
  }
}
