import { z } from 'zod'

/**
 * The interpreter the managed environment is built on.
 *
 * build123d 0.13 requires >=3.11,<3.15, and the `cadquery-ocp-novtk` it pulls in
 * ships ABI-specific wheels over the same range. An interpreter outside it
 * matches no wheel and pip falls back to building OCCT from source, which does
 * not end well.
 */
export const PYTHON_VERSION = '3.12'

/**
 * Pinned so that an install today and an install in six months agree, and so
 * that the agent guidance and API documentation describe what is installed.
 *
 * 0.13.0 is the first release carrying the fix for the Windows font crash that
 * had this on a dev commit: FontManager parsed every file in the Windows font
 * directories at import time and guarded none of it, so mstmc.ttf - which
 * ships with Windows and is not a parseable font - took the whole import down.
 */
export const BUILD123D_VERSION = '0.13.0'

export const OCP_TESSELLATE_VERSION = '3.5.3'

/** What `uv pip install` is handed. */
export const PYTHON_INSTALL_SPECS: string[] = [
  `build123d==${BUILD123D_VERSION}`,
  `ocp-tessellate==${OCP_TESSELLATE_VERSION}`,
]

/** What a working environment reports back, and what status is judged against. */
export const PYTHON_REQUIREMENTS: Record<string, string> = {
  build123d: BUILD123D_VERSION,
  'ocp-tessellate': OCP_TESSELLATE_VERSION,
}

export const pythonEnvSourceSchema = z.enum(['managed', 'custom'])
export type PythonEnvSource = z.infer<typeof pythonEnvSourceSchema>

export const pythonInstallStepSchema = z.enum([
  'interpreter',
  'environment',
  'packages',
  'validate',
])
export type PythonInstallStep = z.infer<typeof pythonInstallStepSchema>

export const PYTHON_INSTALL_STEPS: PythonInstallStep[] = [
  'interpreter',
  'environment',
  'packages',
  'validate',
]

const installedPackagesSchema = z.record(z.string(), z.string())

export const pythonEnvStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('not-installed') }),
  z.object({
    state: z.literal('installing'),
    step: pythonInstallStepSchema,
  }),
  z.object({
    state: z.literal('ready'),
    source: pythonEnvSourceSchema,
    interpreter: z.string(),
    pythonVersion: z.string(),
    packages: installedPackagesSchema,
  }),
  // Imports fine, but at versions this build was not pinned against - the
  // agent's guidance and API documentation are written for the pinned ones.
  z.object({
    state: z.literal('outdated'),
    source: pythonEnvSourceSchema,
    interpreter: z.string(),
    pythonVersion: z.string(),
    packages: installedPackagesSchema,
    expected: installedPackagesSchema,
  }),
  z.object({
    state: z.literal('broken'),
    source: pythonEnvSourceSchema,
    interpreter: z.string(),
    reason: z.string(),
  }),
  z.object({
    state: z.literal('failed'),
    step: pythonInstallStepSchema,
    message: z.string(),
  }),
])
export type PythonEnvStatus = z.infer<typeof pythonEnvStatusSchema>

export const pythonInstallProgressSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('step'),
    step: pythonInstallStepSchema,
    index: z.number(),
    total: z.number(),
  }),
  z.object({ type: z.literal('log'), line: z.string() }),
  z.object({ type: z.literal('done'), status: pythonEnvStatusSchema }),
])
export type PythonInstallProgress = z.infer<typeof pythonInstallProgressSchema>
