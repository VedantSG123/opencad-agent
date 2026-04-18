import * as fs from 'node:fs'

import { attachFS, Passthrough, resolveMountConfig } from '@zenfs/core'
import { Elysia, t } from 'elysia'

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
  },
  message(ws, data) {
    handleMessage(ws.raw as ElysiaServerRawWebSocket, data as string | Buffer)
  },
  close(ws) {
    removeHandlers(ws.id)
  },
})

export { wsRoutes }
