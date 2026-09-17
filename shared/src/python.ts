import { z } from 'zod'

/**
 * The interpreter the managed environment is built on.
 *
 * `cadquery-ocp-novtk`, which build123d pulls in, ships ABI-specific wheels and
 * requires >=3.11,<3.15. An interpreter outside that range matches no wheel and
 * pip falls back to building OCCT from source, which does not end well.
 */
export const PYTHON_VERSION = '3.12'

/**
 * build123d is pinned to a commit rather than a release.
 *
 * PyPI's 0.11.1 cannot be imported on a stock Windows install: FontManager
 * parses every file in the Windows font directories at import time and
 * `register_font` guards none of it, so mstmc.ttf - which ships with Windows
 * and is not a parseable font - takes the whole import down. The dev branch
 * wraps it in a try/except; no release carries that yet. Move to the next PyPI
 * release that does.
 */
export const BUILD123D_COMMIT = '5b1b4b5da481a7b0140cb71d32b7fa93fe8032ce'

/**
 * A GitHub archive carries no git history, so setuptools_scm cannot derive a
 * version from it and the build fails outright unless it is told one.
 */
export const BUILD123D_VERSION = '0.11.2.dev0'

export const OCP_TESSELLATE_VERSION = '3.5.3'

/** What `uv pip install` is handed. */
export const PYTHON_INSTALL_SPECS: string[] = [
  `build123d @ https://github.com/gumyr/build123d/archive/${BUILD123D_COMMIT}.tar.gz`,
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
