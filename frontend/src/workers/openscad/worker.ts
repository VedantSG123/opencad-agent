import { expose } from 'comlink'

import type { CompileResult } from '@/kernels/openscad/OpenSCADWrapper'
import { OpenSCADWrapper } from '@/kernels/openscad/OpenSCADWrapper'

let wrapper: OpenSCADWrapper | null = null

function getWrapper(): OpenSCADWrapper {
  if (!wrapper) {
    wrapper = new OpenSCADWrapper()
  }
  return wrapper
}

async function compile(
  main: { path: string; code: string },
  overrides?: Record<string, { content: string }>,
  remoteFsUrl?: string,
): Promise<CompileResult> {
  return getWrapper().compile(main, overrides, remoteFsUrl)
}

async function exportSTL(
  main: { path: string; code: string },
  overrides?: Record<string, { content: string }>,
  remoteFsUrl?: string,
): Promise<CompileResult> {
  return getWrapper().exportSTL(main, overrides, remoteFsUrl)
}

const service = {
  compile,
  exportSTL,
}

expose(service)
