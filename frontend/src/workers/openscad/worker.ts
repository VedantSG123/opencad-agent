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

function init(): boolean {
  getWrapper()
  return true
}

async function compile(code: string): Promise<CompileResult> {
  return getWrapper().compile(code)
}

async function exportSTL(code: string): Promise<CompileResult> {
  return getWrapper().exportSTL(code)
}

function writeFile(path: string, content: Uint8Array | string): void {
  getWrapper().writeFile(path, content)
}

function readFile(path: string): Uint8Array | string | null {
  return getWrapper().readFile(path)
}

function deleteFile(path: string): void {
  getWrapper().deleteFile(path)
}

function listFiles(): string[] {
  return getWrapper().listFiles()
}

const service = {
  init,
  compile,
  exportSTL,
  writeFile,
  readFile,
  deleteFile,
  listFiles,
}

expose(service)
