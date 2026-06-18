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
  compile(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
    vars?: Record<string, unknown>,
  ) {
    return wrapper.compile(main, overrides, projectDirectory, vars)
  },

  exportSTL(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
    vars?: Record<string, unknown>,
  ) {
    return wrapper.exportSTL(main, overrides, projectDirectory, vars)
  },

  checkSyntax(
    main: { path: string; code: string },
    overrides?: Record<string, { content: string }>,
    projectDirectory?: string,
  ) {
    return wrapper.checkSyntax(main, overrides, projectDirectory)
  },
}

const [provide] = defineProxy(() => service, {
  namespace: 'openscad-worker',
  heartbeatCheck: false,
  transfer: true,
})

provide(new NodeAdapter(parentPort, 'openscad-worker-provider'))

export type OpenSCADWorkerService = typeof service
