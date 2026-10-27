import type { AgentUIChunk } from './uiMessages'

export function appendRunChunk(
  buffer: AgentUIChunk[],
  chunk: AgentUIChunk,
): number {
  if (chunk.type === 'data-build' && chunk.data.report !== undefined) {
    const requestIndex = buffer.findIndex(
      (previous) =>
        previous.type === 'data-build' &&
        previous.data.toolCallId === chunk.data.toolCallId &&
        previous.data.report === undefined,
    )
    if (requestIndex >= 0) buffer[requestIndex] = chunk
  }
  const index = buffer.length
  buffer.push(chunk)
  return index
}
