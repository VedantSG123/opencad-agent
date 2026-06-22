import { isAbsolute, relative, resolve } from 'node:path'

import { Elysia, t } from 'elysia'

import { SUPPORTED_CAD_KERNELS } from '../../cad'
import { createProject } from '../../project/index'
import {
  deleteProject,
  getAllProjects,
  getProjectById,
  upsertProject,
} from '../../utils/dbUtils/projects'

const projectIdParam = t.Object({ id: t.String() })

const createProjectBody = t.Object({
  name: t.String({ minLength: 1 }),
  cad_kernel: t.Union(SUPPORTED_CAD_KERNELS.options.map((v) => t.Literal(v))),
  directory: t.String({ minLength: 1 }),
  action: t.Union([t.Literal('create'), t.Literal('open')]),
})

const updateProjectBody = t.Object({
  name: t.Optional(t.String({ minLength: 1 })),
  file: t.Optional(t.Union([t.String({ minLength: 1 }), t.Null()])),
})

export const projectsRoutes = new Elysia({ prefix: '/projects' })
  .get('/', () => getAllProjects())

  .post(
    '/',
    ({ body }) => {
      return createProject(body)
    },
    { body: createProjectBody },
  )

  .get(
    '/:id',
    ({ params, status }) => {
      const project = getProjectById(params.id)
      if (!project) return status(404, { message: 'Project not found' })
      return project
    },
    { params: projectIdParam },
  )

  .patch(
    '/:id',
    async ({ params, body, status }) => {
      const existing = getProjectById(params.id)
      if (!existing) return status(404, { message: 'Project not found' })

      if ('file' in body && body.file != null) {
        const normDir = resolve(existing.directory)
        const normFile = resolve(body.file)
        const rel = relative(normDir, normFile)
        const isInside = rel && !rel.startsWith('..') && !isAbsolute(rel)
        if (!isInside) {
          return status(400, {
            message: 'File must be inside the project directory',
          })
        }
        if (!(await Bun.file(body.file).exists())) {
          return status(400, { message: `File not found: ${body.file}` })
        }
      }

      return upsertProject({
        ...existing,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...('file' in body ? { file: body.file ?? null } : {}),
      })
    },
    { params: projectIdParam, body: updateProjectBody },
  )

  .delete(
    '/:id',
    ({ params, status }) => {
      const existing = getProjectById(params.id)
      if (!existing) return status(404, { message: 'Project not found' })
      deleteProject(params.id)
      return status(204)
    },
    { params: projectIdParam },
  )
