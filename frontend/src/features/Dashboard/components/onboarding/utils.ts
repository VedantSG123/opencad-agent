const DEFAULT_PROJECT_NAME = 'New OpenCAD Project'

export function getNextProjectName(existingNames: string[]): string {
  if (!existingNames.includes(DEFAULT_PROJECT_NAME)) return DEFAULT_PROJECT_NAME

  let n = 1
  while (existingNames.includes(`${DEFAULT_PROJECT_NAME}(${n})`)) n++
  return `${DEFAULT_PROJECT_NAME}(${n})`
}
