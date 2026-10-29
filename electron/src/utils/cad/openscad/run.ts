import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { app } from 'electron'

import type { CompileResult } from './OpenSCADWrapper.js'
import { OpenSCADWrapper } from './OpenSCADWrapper.js'

export type { CompileResult }

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface OpenSCADRequest {
  action: 'compile' | 'export' | 'checkSyntax'
  main: { path: string; code: string }
  overrides?: Record<string, { content: string }>
  projectDirectory?: string
  vars?: Record<string, unknown>
  format?: string
}

export function executeOpenSCAD(
  request: OpenSCADRequest,
): Promise<CompileResult> {
  const openscadResourcesPath = app.isPackaged
    ? path.join(process.resourcesPath, 'openscad-libs')
    : path.join(__dirname, '../../../..', 'openscad-libs')

  return new OpenSCADWrapper(
    openscadResourcesPath,
    app.getPath('userData'),
  ).execute(request)
}
