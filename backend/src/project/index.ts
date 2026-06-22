import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { CADKernels } from '../cad'
import { upsertProject } from '../utils/dbUtils/projects'
import { generateIdWithPrefix } from '../utils/generateId'
import type { Project } from './schema'

export async function createProject({
  name,
  cad_kernel,
  directory,
  action,
}: Omit<Project, 'id' | 'time' | 'file'> & { action: 'create' | 'open' }) {
  const id = generateIdWithPrefix('project', false)

  let resolvedFile: string | null = null
  if (action === 'create') {
    const filename = `main${CADKernels[cad_kernel].fileExtension}`
    resolvedFile = join(directory, filename)
    await createProjectFile(resolvedFile)
  }

  const project: Project = {
    id,
    name,
    cad_kernel,
    directory,
    file: resolvedFile,
    time: {
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
  }
  return upsertProject(project)
}

async function createProjectFile(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  if (!(await Bun.file(filePath).exists())) {
    await Bun.write(filePath, '')
  }
}
