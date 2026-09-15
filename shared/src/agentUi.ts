import type { PermissionPrompt } from './permissions.js'

/**
 * A file a turn wrote. Derived from what a tool call declared it would touch,
 * so a `shell` command that writes a file produces none - a command declares
 * no paths.
 */
export type FileChanged = {
  path: string
  tool: string
}

/**
 * The custom data parts the agent stream carries alongside the AI SDK's own
 * text and tool parts.
 *
 * A plain map rather than an `ai` type, to keep that dependency out of
 * `shared`; the frontend composes `UIMessage<never, AgentUIDataTypes>` with
 * its own copy of the SDK.
 */
export type AgentUIDataTypes = {
  permission: PermissionPrompt
  'file-changed': FileChanged
  /**
   * Nothing to render - it exists so the connection has traffic on it while a
   * turn is quiet. Sent `transient`, so the SDK does not keep it in the
   * message, and never buffered, so a reconnecting client is not replayed a
   * stream of old heartbeats. The value is the moment it was sent, which is
   * enough for a client to tell a slow turn from a dead socket.
   */
  'keep-alive': number
}
