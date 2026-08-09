import type { PermissionRule } from 'shared'

import { addRule } from './ruleSet'

// Deliberately not persisted: "allow for this session" ends with the backend
// process, and a fresh process asks again.
const rulesBySession = new Map<string, PermissionRule[]>()

export function getSessionRules(sessionId: string): PermissionRule[] {
  return rulesBySession.get(sessionId) ?? []
}

export function addSessionRule(sessionId: string, rule: PermissionRule): void {
  rulesBySession.set(sessionId, addRule(getSessionRules(sessionId), rule))
}

export function clearSessionRules(sessionId: string): void {
  rulesBySession.delete(sessionId)
}
