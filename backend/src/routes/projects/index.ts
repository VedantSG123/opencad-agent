import { Elysia, t } from 'elysia'

import { SUPPORTED_CAD_KERNELS } from '../../cad'
import { getUserDocumentsDir, openFileDialog } from '../../lib/file-dialog'
import { createProject } from '../../project/index'
import {
  deleteProject,
  getAllProjects,
  getProjectById,
  upsertProject,
} from '../../utils/dbUtils/projects'
import { logger } from '../../utils/logger'

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

const fileDialogQuery = t.Object({
  mode: t.Union([t.Literal('file'), t.Literal('directory')]),
})

function sseEvent(event: string, data: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ event, ...data })}\n\n`
}

export const projectsRoutes = new Elysia({ prefix: '/projects' })
  .get('/', () => getAllProjects())

  .get(
    '/file-dialog',
    ({ query }) => {
      const isFileMode = query.mode === 'file'

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          let closed = false

          const keepAlive = setInterval(() => {
            if (closed) return
            controller.enqueue(
              encoder.encode(sseEvent('KEEP_ALIVE', { ts: Date.now() })),
            )
          }, 2000)

          const cleanup = () => {
            if (closed) return
            closed = true
            clearInterval(keepAlive)
          }

          const fileTypes = isFileMode ? ['*.js', '*.scad'] : ['*']
          const title = isFileMode
            ? 'Select a CAD script file'
            : 'Select a project directory'

          openFileDialog(getUserDocumentsDir(), fileTypes, false, title)
            .then((result) => {
              if (closed) return
              cleanup()

              if (result.canceled || result.files.length === 0) {
                controller.enqueue(
                  encoder.encode(
                    sseEvent('DONE', { path: null, canceled: true }),
                  ),
                )
              } else {
                controller.enqueue(
                  encoder.encode(
                    sseEvent('DONE', {
                      path: result.files[0],
                      canceled: false,
                    }),
                  ),
                )
              }

              controller.close()
            })
            .catch((err: unknown) => {
              if (closed) return
              cleanup()

              const message =
                err instanceof Error ? err.message : 'Unknown error'
              logger.error(`File dialog error: ${message}`)

              controller.enqueue(encoder.encode(sseEvent('ERROR', { message })))

              controller.close()
            })
        },
        cancel() {
          logger.info('File dialog SSE: client disconnected')
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    },
    { query: fileDialogQuery },
  )

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
