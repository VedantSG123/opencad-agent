/**
 * The names the model calls tools by, kept in a module that imports nothing.
 * The permission registry keys off these, and it must be able to name a tool
 * without loading the tool - otherwise judging a call would drag ripgrep, the
 * database and every future dependency into the policy layer.
 */

export const READ_TOOL_NAME = 'read'
export const GREP_TOOL_NAME = 'grep'
export const EDIT_TOOL_NAME = 'edit'
export const CREATE_TOOL_NAME = 'create'
export const GET_API_DOCUMENTATION_TOOL_NAME = 'getApiDocumentation'
export const SHELL_TOOL_NAME = 'shell'

/** Every tool the agent may be handed. `createTools` must return all of them. */
export const TOOL_NAMES = [
  READ_TOOL_NAME,
  GREP_TOOL_NAME,
  EDIT_TOOL_NAME,
  CREATE_TOOL_NAME,
  GET_API_DOCUMENTATION_TOOL_NAME,
  SHELL_TOOL_NAME,
] as const

export type ToolName = (typeof TOOL_NAMES)[number]
