import openCascade from 'replicad-opencascadejs/src/replicad_with_exceptions.js';
import openCascadeWasm from 'replicad-opencascadejs/src/replicad_with_exceptions.wasm?url';

export async function initOCC() {
  // @ts-expect-error OpenCascade.js module lacks proper TypeScript definitions
  return await openCascade({
    locateFile: () => openCascadeWasm,
  });
}
