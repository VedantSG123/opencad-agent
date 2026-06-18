import { fileURLToPath } from 'node:url'

import { defineProxy } from 'comctx'
import { app } from 'electron'
import * as path from 'path'
import { Worker } from 'worker_threads'

import { NodeAdapter } from '../../workers/openscad/nodeAdapter.js'
import type { OpenSCADWorkerService } from '../../workers/openscad/worker.js'

export type { OpenSCADWorkerService }

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let workerInstance: Worker | null = null
let workerApi: OpenSCADWorkerService | null = null

export function getOpenSCADWorker(): OpenSCADWorkerService {
  if (!workerInstance) {
    const isPackaged = app.isPackaged
    const openscadResourcesPath = isPackaged
      ? path.join(process.resourcesPath, 'openscad-libs')
      : path.join(__dirname, '../../..', 'openscad-libs')

    const workerPath = path.join(__dirname, '../../workers/openscad/worker.js')
    console.log(`Spawning OpenSCAD Node worker from: ${workerPath}`)
    console.log(`Using OpenSCAD resources path: ${openscadResourcesPath}`)

    workerInstance = new Worker(workerPath, {
      workerData: { openscadResourcesPath },
    })

    workerInstance.on('error', (err) => {
      console.error('OpenSCAD Node worker error:', err)
    })

    workerInstance.on('exit', (code) => {
      console.log(`OpenSCAD Node worker exited with code ${code}`)
      workerInstance = null
      workerApi = null
    })

    if (!workerInstance) {
      console.error('Failed to spawn OpenSCAD Node worker.')
    }

    const [, inject] = defineProxy(() => ({}) as OpenSCADWorkerService, {
      namespace: 'openscad-worker',
      heartbeatCheck: false,
      transfer: true,
    })

    workerApi = inject(
      new NodeAdapter(workerInstance, 'openscad-worker-injector'),
    )
  }

  return workerApi!
}

export async function terminateOpenSCADWorker(): Promise<void> {
  if (workerInstance) {
    console.log('Terminating OpenSCAD Node worker...')
    await workerInstance.terminate()
    workerInstance = null
    workerApi = null
  }
}
