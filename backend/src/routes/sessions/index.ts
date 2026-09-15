import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { Elysia, t } from 'elysia'
import type { Attachment, PermissionScope } from 'shared'
import { attachmentRefusal, attachmentSetRefusal } from 'shared'

import type { ModelRef } from '../../agent/model'
import { resolveModel } from '../../agent/model'
import {
  abortRun,
  answerPermission,
  hasRun,
  isRunning,
  RunInFlightError,
  startRun,
  subscribe,
} from '../../agent/run/registry'
import type { AgentUIMessage } from '../../agent/run/uiMessages'
import { toUIMessages } from '../../agent/run/uiMessages'
import { loadSessionMessages } from '../../agent/session/history'
import type { Model } from '../../models/schemas'
import { getProjectById } from '../../utils/dbUtils/projects'
import {
  createSession,
  deleteSession,
  getSessionById,
  getSessionsByProjectId,
  renameSession,
} from '../../utils/dbUtils/sessions'

const sessionIdParam = t.Object({ id: t.String() })

const permissionParams = t.Object({ id: t.String(), callId: t.String() })

const listQuery = t.Object({ projectId: t.String() })

const streamQuery = t.Object({ after: t.Optional(t.String()) })

const createSessionBody = t.Object({
  projectId: t.String({ minLength: 1 }),
  title: t.Optional(t.String({ minLength: 1 })),
})

const renameSessionBody = t.Object({ title: t.String({ minLength: 1 }) })

const attachment = t.Object({
  mime: t.String({ minLength: 1 }),
  url: t.String({ minLength: 1 }),
  filename: t.Optional(t.String()),
})

const promptBody = t.Object({
  // Not `minLength: 1`: an attachment on its own is a message. The handler
  // refuses only when there is neither text nor a file.
  prompt: t.String(),
  model: t.Object({
    providerId: t.String({ minLength: 1 }),
    modelId: t.String({ minLength: 1 }),
  }),
  // The count is checked in the handler rather than here, so going over it
  // answers with a sentence instead of a schema violation. The body size
  // limit on the server is what stops an absurd array being parsed at all.
  files: t.Optional(t.Array(attachment)),
})

/**
 * Comfortably under Bun's 10s default `idleTimeout`, which closes a
 * connection that has carried no bytes - mid-response included. Raising this
 * past that default silently breaks every quiet turn.
 */
const KEEP_ALIVE_MS = 5_000

const answerBody = t.Object({
  scope: t.Optional(
    t.Union([t.Literal('once'), t.Literal('session'), t.Literal('project')]),
  ),
  deny: t.Optional(t.Boolean()),
})

export const sessionsRoutes = new Elysia({ prefix: '/sessions' })
  .get('/', ({ query }) => getSessionsByProjectId(query.projectId), {
    query: listQuery,
  })

  .post(
    '/',
    ({ body, status }) => {
      if (!getProjectById(body.projectId)) {
        return status(404, { message: 'Project not found' })
      }
      return createSession(body.projectId, body.title ?? defaultTitle())
    },
    { body: createSessionBody },
  )

  .get(
    '/:id',
    ({ params, status }) => {
      const session = getSessionById(params.id)
      if (!session) return status(404, { message: 'Session not found' })

      return {
        session,
        messages: toUIMessages(loadSessionMessages(session.id)),
        running: isRunning(session.id),
      }
    },
    { params: sessionIdParam },
  )

  .patch(
    '/:id',
    ({ params, body, status }) => {
      const session = renameSession(params.id, body.title)
      return session ?? status(404, { message: 'Session not found' })
    },
    { params: sessionIdParam, body: renameSessionBody },
  )

  .delete(
    '/:id',
    ({ params, status }) => {
      if (!getSessionById(params.id)) {
        return status(404, { message: 'Session not found' })
      }
      abortRun(params.id)
      deleteSession(params.id)
      return status(204)
    },
    { params: sessionIdParam },
  )

  .post(
    '/:id/prompt',
    async ({ params, body, status }) => {
      const session = getSessionById(params.id)
      if (!session) return status(404, { message: 'Session not found' })

      const project = getProjectById(session.project_id)
      if (!project) {
        return status(404, { message: 'Project not found' })
      }

      const files = body.files ?? []
      if (!body.prompt.trim() && files.length === 0) {
        return status(400, { message: 'Send something to say, or a file.' })
      }

      const model: ModelRef = {
        providerId: body.model.providerId,
        modelId: body.model.modelId,
      }

      // Resolved here rather than left to the loop so that an unusable model,
      // or a file it cannot read, is a status the composer can show - once the
      // run has started the only way back is an error on the stream.
      let resolved
      try {
        resolved = await resolveModel(model)
      } catch (error) {
        return status(400, {
          message: error instanceof Error ? error.message : String(error),
        })
      }

      const refusal = attachmentsRefusal(files, resolved.info)
      if (refusal) return status(400, { message: refusal })

      try {
        startRun({ session, project, model, prompt: body.prompt, files })
      } catch (error) {
        if (error instanceof RunInFlightError) {
          return status(409, { message: error.message })
        }
        throw error
      }

      return status(202, { sessionId: session.id })
    },
    { params: sessionIdParam, body: promptBody },
  )

  .get(
    '/:id/stream',
    ({ params, query, status }) => {
      if (!getSessionById(params.id)) {
        return status(404, { message: 'Session not found' })
      }

      // `reconnectToStream` reads a 204 as "no live stream" and falls back
      // to the stored history.
      if (!hasRun(params.id)) return status(204)

      const after = Number.parseInt(query.after ?? '', 10)
      const afterIndex = Number.isFinite(after) ? after : -1

      const stream = createUIMessageStream<AgentUIMessage>({
        execute: ({ writer }) =>
          new Promise<void>((resolve, reject) => {
            let unsubscribe: (() => void) | null = null

            // A turn goes quiet for minutes at a time - a permission question
            // waiting on a person, a `shell` command grinding away - and a
            // connection with no traffic on it is one Bun will close. These
            // are written straight to this connection, never through
            // `publish`: they are not part of what the run did, and a client
            // reconnecting to the buffer must not be replayed a thousand of
            // them.
            const heartbeat = setInterval(() => {
              try {
                writer.write({
                  type: 'data-keep-alive',
                  data: Date.now(),
                  transient: true,
                })
              } catch {
                // The connection went away between ticks; the listener below
                // will not fire again either.
                finish()
              }
            }, KEEP_ALIVE_MS)
            heartbeat.unref?.()

            function finish(): void {
              clearInterval(heartbeat)
              unsubscribe?.()
              resolve()
            }

            unsubscribe = subscribe(
              params.id,
              (event) => {
                if (event.type === 'end') {
                  finish()
                  return
                }
                writer.write(event.chunk)
              },
              afterIndex,
            )

            // The run ended between the check above and here.
            if (!unsubscribe) {
              finish()
              return
            }

            writer.onError = (error: unknown) => {
              clearInterval(heartbeat)
              reject(error instanceof Error ? error : new Error(String(error)))
            }
          }),
        onError: (error) =>
          error instanceof Error ? error.message : String(error),
      })

      return createUIMessageStreamResponse({ stream })
    },
    { params: sessionIdParam, query: streamQuery },
  )

  .post(
    '/:id/permissions/:callId',
    ({ params, body, status }) => {
      const scope: PermissionScope | null = body.deny
        ? null
        : (body.scope ?? null)

      const result = answerPermission(params.id, params.callId, scope)
      if (result === 'no-such-run') {
        return status(404, {
          message: 'No tool call is waiting on that permission.',
        })
      }
      if (result === 'not-offered') {
        return status(400, {
          message: `"${String(scope)}" was not one of the choices this request offered.`,
        })
      }
      return status(204)
    },
    { params: permissionParams, body: answerBody },
  )

  .post(
    '/:id/abort',
    ({ params, status }) =>
      abortRun(params.id)
        ? status(204)
        : status(409, { message: 'No turn is in flight for this session.' }),
    { params: sessionIdParam },
  )

function defaultTitle(): string {
  return `Session ${new Date().toLocaleString()}`
}

/** The first thing wrong with the attachments, or `null` if nothing is. */
function attachmentsRefusal(files: Attachment[], model: Model): string | null {
  const capabilities = {
    image: model.capabilities.input.image,
    pdf: model.capabilities.input.pdf,
  }

  for (const file of files) {
    const refusal = attachmentRefusal(file, capabilities)
    if (refusal) return refusal
  }

  return attachmentSetRefusal(files)
}
