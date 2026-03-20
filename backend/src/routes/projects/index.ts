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
  file: t.Optional(t.String()),
})

const updateProjectBody = t.Object({
  name: t.String({ minLength: 1 }),
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
    ({ params, body, status }) => {
      const existing = getProjectById(params.id)
      if (!existing) return status(404, { message: 'Project not found' })
      return upsertProject({ ...existing, name: body.name })
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
