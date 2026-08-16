import { describeEditAccess } from '../../tools/edit/permissions'
import { describeGrepAccess } from '../../tools/grep/permissions'
import {
  EDIT_TOOL_NAME,
  GET_API_DOCUMENTATION_TOOL_NAME,
  GREP_TOOL_NAME,
  READ_TOOL_NAME,
} from '../../tools/names'
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
    case READ_TOOL_NAME:
      return describeReadAccess(input)
    case GREP_TOOL_NAME:
      return describeGrepAccess(input)
    case EDIT_TOOL_NAME:
      return describeEditAccess(input)
    // Reaches no path the model chooses: the documentation store is read-only
    // and owned by the app.
    case GET_API_DOCUMENTATION_TOOL_NAME:
      return []
    default:
      return null
  }
}
