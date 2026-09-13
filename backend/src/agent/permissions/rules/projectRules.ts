import type { PermissionRule } from 'shared'

import { getProjectById, upsertProject } from '../../../utils/dbUtils/projects'
import { addRule } from './ruleSet'

/** The rules stored in the project's `preferences` column. */
export function getProjectRules(projectId: string): PermissionRule[] {
  return getProjectById(projectId)?.preferences.permissions.rules ?? []
}

export function addProjectRule(projectId: string, rule: PermissionRule): void {
  const project = getProjectById(projectId)
  if (!project) {
    throw new Error(`Project ${projectId} not found.`)
  }

  upsertProject({
    ...project,
    preferences: {
      ...project.preferences,
      permissions: {
        ...project.preferences.permissions,
        rules: addRule(project.preferences.permissions.rules, rule),
      },
    },
  })
}
