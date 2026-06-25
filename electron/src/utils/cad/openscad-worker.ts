import { fileURLToPath } from 'node:url'

import { defineProxy } from 'comctx'
import { app } from 'electron'
import * as path from 'path'
import { Worker } from 'worker_threads'

import { NodeAdapter } from '../../workers/openscad/nodeAdapter.js'
import type { CompileResult } from '../../workers/openscad/OpenSCADWrapper.js'
import type { OpenSCADWorkerService } from '../../workers/openscad/worker.js'

export type { CompileResult, OpenSCADWorkerService }

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface OpenSCADRequest {
  action: 'compile' | 'export' | 'checkSyntax'
  main: { path: string; code: string }
  overrides?: Record<string, { content: string }>
  projectDirectory?: string
  vars?: Record<string, unknown>
  format?: string
}

export async function executeOpenSCAD(
  request: OpenSCADRequest,
): Promise<CompileResult> {
  const isPackaged = app.isPackaged
  const openscadResourcesPath = isPackaged
    ? path.join(process.resourcesPath, 'openscad-libs')
    : path.join(__dirname, '../../..', 'openscad-libs')

  const workerPath = path.join(__dirname, '../../workers/openscad/worker.js')
  console.log(
    `Spawning OpenSCAD Node worker for action "${request.action}" from: ${workerPath}`,
  )

  const workerInstance = new Worker(workerPath, {
    workerData: {
      openscadResourcesPath,
      userDataPath: app.getPath('userData'),
    },
  })

  workerInstance.on('error', (err) => {
    console.error('OpenSCAD Node worker error:', err)
  })

  try {
    const [, inject] = defineProxy(() => ({}) as OpenSCADWorkerService, {
      namespace: 'openscad-worker',
      heartbeatCheck: false,
      transfer: true,
    })

    const workerApi = inject(
      new NodeAdapter(workerInstance, 'openscad-worker-injector'),
    )

    return await workerApi.execute(request)
  } finally {
    console.log(
      `Terminating OpenSCAD Node worker for action "${request.action}"`,
    )
    await workerInstance.terminate()
  }
}
