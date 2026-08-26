import { getApiDocumentation } from './cad/replicad/getApiDocumentation'
import { createEditTool } from './edit'
import { createGrepTool } from './grep'
import {
  EDIT_TOOL_NAME,
  GET_API_DOCUMENTATION_TOOL_NAME,
  GREP_TOOL_NAME,
  READ_TOOL_NAME,
  SHELL_TOOL_NAME,
} from './names'
import type { ToolName } from './names'
import { createReadTool } from './read'
import { createShellTool } from './shell'
import type { ToolContext, ToolPermissions } from './types'

export { getApiDocumentation } from './cad/replicad/getApiDocumentation'
export { createEditTool } from './edit'
export { createGrepTool } from './grep'
export {
  EDIT_TOOL_NAME,
  GET_API_DOCUMENTATION_TOOL_NAME,
  GREP_TOOL_NAME,
  READ_TOOL_NAME,
  SHELL_TOOL_NAME,
  TOOL_NAMES,
} from './names'
export type { ToolName } from './names'
export { createReadTool } from './read'
export { createShellTool } from './shell'
export type { ToolContext, ToolPermissions } from './types'

/**
 * Every tool the agent can call, keyed by the name the model sees. The
 * `satisfies` forces this list and `TOOL_NAMES` to stay identical, and
 * `toolset.test.ts` requires a permission descriptor for every name there - so
 * a new tool cannot reach the model without the policy knowing what it touches.
 */
export function createTools(permissions: ToolPermissions) {
  // Layer 1 resolves a relative path against the project directory while the
  // tool resolves it against its working directory. Deriving both from one
  // field is what keeps the policy judging the path the tool actually opens.
  const contextFor = (tool: string): ToolContext => ({
    workingDirectory: permissions.projectDirectory,
    permissions: permissions.guardFor(tool),
  })

  return {
    [READ_TOOL_NAME]: createReadTool(contextFor(READ_TOOL_NAME)),
    [GREP_TOOL_NAME]: createGrepTool(contextFor(GREP_TOOL_NAME)),
    [EDIT_TOOL_NAME]: createEditTool(contextFor(EDIT_TOOL_NAME)),
    [SHELL_TOOL_NAME]: createShellTool(contextFor(SHELL_TOOL_NAME)),
    [GET_API_DOCUMENTATION_TOOL_NAME]: getApiDocumentation,
  } satisfies Record<ToolName, unknown>
}
