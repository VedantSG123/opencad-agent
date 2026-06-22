import { parentPort, workerData } from 'node:worker_threads'

import { defineProxy } from 'comctx'

import { NodeAdapter } from './nodeAdapter.js'
import { OpenSCADWrapper } from './OpenSCADWrapper.js'

if (!parentPort) {
  throw new Error('This file must be run as a worker thread.')
}

const { openscadResourcesPath } = workerData as {
  openscadResourcesPath: string
}

const wrapper = new OpenSCADWrapper(openscadResourcesPath)

const service = {
  execute(request: {
    action: 'compile' | 'export' | 'checkSyntax'
    main: { path: string; code: string }
    overrides?: Record<string, { content: string }>
    projectDirectory?: string
    vars?: Record<string, unknown>
    format?: string
  }) {
    return wrapper.execute(request)
  },
}

const [provide] = defineProxy(() => service, {
  namespace: 'openscad-worker',
  heartbeatCheck: false,
  transfer: true,
})

provide(new NodeAdapter(parentPort, 'openscad-worker-provider'))

export type OpenSCADWorkerService = typeof service
