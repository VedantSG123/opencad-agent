import { Elysia, t } from 'elysia'

import { SUPPORTED_CAD_KERNELS, SUPPORTED_EXTENSIONS } from '../../cad'
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
  action: t.Union([t.Literal('create'), t.Literal('open')]),
})

const updateProjectBody = t.Object({
  name: t.Optional(t.String({ minLength: 1 })),
  file: t.Optional(t.Union([t.String({ minLength: 1 }), t.Null()])),
})

const fileDialogQuery = t.Object({
  mode: t.Union([t.Literal('file'), t.Literal('directory')]),
  extension: t.Optional(t.String()),
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

          const isDirectoryMode = !isFileMode
          const ext = query.extension
          const fileTypes = isFileMode
            ? ext
              ? [`*${ext}`]
              : SUPPORTED_EXTENSIONS.map((e) => `*${e}`)
            : ['*']
          const title = isFileMode
            ? `Select a CAD script file${ext ? ` (${ext})` : ''}`
            : 'Select a project directory'

          openFileDialog(
            getUserDocumentsDir(),
            fileTypes,
            false,
            title,
            isDirectoryMode,
          )
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
                const selectedPath = result.files[0]

                if (isFileMode && ext) {
                  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
                    controller.enqueue(
                      encoder.encode(
                        sseEvent('ERROR', {
                          message: `Unsupported file extension "${ext}". Allowed: ${SUPPORTED_EXTENSIONS.join(', ')}`,
                        }),
                      ),
                    )
                    controller.close()
                    return
                  }
                  if (!selectedPath.endsWith(ext)) {
                    controller.enqueue(
                      encoder.encode(
                        sseEvent('ERROR', {
                          message: `Invalid file type. Expected a ${ext} file.`,
                        }),
                      ),
                    )
                    controller.close()
                    return
                  }
                }

                controller.enqueue(
                  encoder.encode(
                    sseEvent('DONE', { path: selectedPath, canceled: false }),
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
    async ({ params, body, status }) => {
      const existing = getProjectById(params.id)
      if (!existing) return status(404, { message: 'Project not found' })

      if ('file' in body && body.file != null) {
        if (!body.file.startsWith(existing.directory + '/')) {
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
