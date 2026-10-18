// "Allow once" leaves behind a warrant rather than a rule: it names the single
// tool call the user saw, along with what they approved for it. The SDK replays
// that call under the same id when the run resumes, and never reuses the id for
// anything else, so the key is itself the one-shot - nothing has to be spent.
const warrantsBySession = new Map<string, Map<string, string[]>>()

export function grantOnce(
  sessionId: string,
  toolCallId: string,
  paths: string[],
): void {
  const warrants = warrantsBySession.get(sessionId)
  if (warrants) {
    warrants.set(toolCallId, paths)
    return
  }
  warrantsBySession.set(sessionId, new Map([[toolCallId, paths]]))
}

export function hasOnceGrant(sessionId: string, toolCallId: string): boolean {
  return warrantsBySession.get(sessionId)?.has(toolCallId) ?? false
}

export function onceGrantedPaths(
  sessionId: string,
  toolCallId: string,
): string[] {
  return warrantsBySession.get(sessionId)?.get(toolCallId) ?? []
}

export function clearOnceGrants(sessionId: string): void {
  warrantsBySession.delete(sessionId)
}
