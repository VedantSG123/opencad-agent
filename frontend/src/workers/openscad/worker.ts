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
  vars?: Record<string, unknown>,
): Promise<CompileResult> {
  return getWrapper().compile(main, overrides, remoteFsUrl, vars)
}

async function exportSTL(
  main: { path: string; code: string },
  overrides?: Record<string, { content: string }>,
  remoteFsUrl?: string,
  vars?: Record<string, unknown>,
): Promise<CompileResult> {
  return getWrapper().exportSTL(main, overrides, remoteFsUrl, vars)
}

async function checkSyntax(
  main: { path: string; code: string },
  overrides?: Record<string, { content: string }>,
  remoteFsUrl?: string,
  vars?: Record<string, unknown>,
): Promise<CompileResult> {
  return getWrapper().checkSyntax(main, overrides, remoteFsUrl, vars)
}

const service = {
  compile,
  exportSTL,
  checkSyntax,
}

expose(service)
