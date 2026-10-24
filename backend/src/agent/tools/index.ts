import type { ToolSet } from 'ai'

import type { Project } from '../../project/schema'
import { offeredToolNames } from '../kernels'
import { createBuildTool } from './build'
import type { BuildRequester } from './build'
import { getApiDocumentation } from './cad/replicad/getApiDocumentation'
import { createCreateTool } from './create'
import { createEditTool } from './edit'
import { createGrepTool } from './grep'
import {
  BUILD_TOOL_NAME,
  CREATE_TOOL_NAME,
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

export { createBuildTool } from './build'
export type { BuildRequester } from './build'
export { getApiDocumentation } from './cad/replicad/getApiDocumentation'
export { createCreateTool } from './create'
export { createEditTool } from './edit'
export { createGrepTool } from './grep'
export {
  BUILD_TOOL_NAME,
  COMMON_TOOL_NAMES,
  CREATE_TOOL_NAME,
  EDIT_TOOL_NAME,
  GET_API_DOCUMENTATION_TOOL_NAME,
  GREP_TOOL_NAME,
  KERNEL_TOOL_NAMES,
  READ_TOOL_NAME,
  SHELL_TOOL_NAME,
  TOOL_NAMES,
} from './names'
export type { KernelToolName, ToolName } from './names'
export { createReadTool } from './read'
export { createShellTool } from './shell'
export { toolFailed } from './types'
export type { ToolContext, ToolPermissions } from './types'

/**
 * The tools offered for `project`'s kernel, keyed by the name the model
 * sees. Every tool is built and then the kernel's share picked out, so the
 * `satisfies` still holds this list to `TOOL_NAMES` and `toolset.test.ts`
 * still requires a permission descriptor for every name - a new tool cannot
 * reach the model without the policy knowing what it touches, whichever
 * kernel it is offered to.
 */
export function createTools(
  permissions: ToolPermissions,
  project: Pick<Project, 'cad_kernel' | 'file'>,
  requestBuild: BuildRequester,
): ToolSet {
  // Layer 1 resolves a relative path against the project directory while the
  // tool resolves it against its working directory. Deriving both from one
  // field is what keeps the policy judging the path the tool actually opens.
  const contextFor = (tool: string): ToolContext => ({
    workingDirectory: permissions.projectDirectory,
    permissions: permissions.guardFor(tool),
  })

  const all = {
    [READ_TOOL_NAME]: createReadTool(contextFor(READ_TOOL_NAME)),
    [GREP_TOOL_NAME]: createGrepTool(contextFor(GREP_TOOL_NAME)),
    [EDIT_TOOL_NAME]: createEditTool(contextFor(EDIT_TOOL_NAME)),
    [CREATE_TOOL_NAME]: createCreateTool(contextFor(CREATE_TOOL_NAME)),
    [SHELL_TOOL_NAME]: createShellTool(contextFor(SHELL_TOOL_NAME)),
    [GET_API_DOCUMENTATION_TOOL_NAME]: getApiDocumentation,
    [BUILD_TOOL_NAME]: createBuildTool({
      workingDirectory: permissions.projectDirectory,
      mainFile: project.file,
      requestBuild,
    }),
  } satisfies Record<ToolName, unknown>

  return Object.fromEntries(
    offeredToolNames(project.cad_kernel).map((name) => [name, all[name]]),
  )
}
