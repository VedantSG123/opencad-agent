import * as fs from 'node:fs'

import { attachFS, Passthrough, resolveMountConfig, RPC } from '@zenfs/core'
import { Elysia, t } from 'elysia'

import {
  joinRoom,
  leaveRoom,
  trackPendingWrite,
} from '../../file-sync/projectDirWatcher'
import type { ElysiaServerRawWebSocket } from '../../file-sync/serverWebsocketRPCPort'
import {
  createPort,
  handleMessage,
  removeHandlers,
} from '../../file-sync/serverWebsocketRPCPort'
import { getProjectById } from '../../utils/dbUtils/projects'

const wsRoutes = new Elysia({ prefix: '/ws' }).ws('/sync', {
  query: t.Object({
    projectId: t.String(),
  }),
  async open(ws) {
    const { projectId } = ws.data.query
    const project = getProjectById(projectId)

    if (!project) {
      ws.close(1008, 'Project not found')
      return
    }

    const projectDirectory = project.directory
    if (!fs.existsSync(projectDirectory)) {
      ws.close(1008, 'Project directory not found')
      return
    }

    const _dirFS = await resolveMountConfig({
      backend: Passthrough,
      fs: fs,
      prefix: projectDirectory,
    })

    const port = createPort(ws.raw as ElysiaServerRawWebSocket)

    if (!port) {
      ws.close(1011, 'Failed to create RPC port')
      return
    }

    attachFS(port, _dirFS)

    joinRoom(projectId, projectDirectory, ws.raw as ElysiaServerRawWebSocket)
    ws.subscribe(projectId)
    ws.publish(projectId, JSON.stringify({ event: 'peer:joined', projectId }))
  },
  message(ws, data) {
    const raw = typeof data === 'string' ? data : (data as Buffer).toString()

    // Peek at the RPC method to track mutations before they hit the disk,
    // so the resulting chokidar event can be suppressed for this sender.
    try {
      const msg = RPC.decodeMessage<RPC.Request>(raw)
      if (msg.method && ws.id) {
        trackPendingWrite(
          ws.data.query.projectId,
          ws.id,
          msg.method,
          msg.args ?? [],
        )
      }
    } catch {
      // not a zenfs RPC message — ignore
    }

    handleMessage(ws.raw as ElysiaServerRawWebSocket, data as string | Buffer)
  },
  close(ws) {
    const { projectId } = ws.data.query
    ws.publish(projectId, JSON.stringify({ event: 'peer:left', projectId }))
    leaveRoom(projectId, ws.id)
    removeHandlers(ws.id)
  },
})

export { wsRoutes }
