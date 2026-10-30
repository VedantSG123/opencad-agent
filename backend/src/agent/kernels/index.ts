import type { SupportedCADKernels } from '../../cad'
import { inlineFile } from '../../utils/macro' with { type: 'macro' }
import { BUILD_TOOL_NAME, COMMON_TOOL_NAMES } from '../tools/names'
import type { KernelToolName, ToolName } from '../tools/names'
import { replicadLibrary } from './libraries/replicad'

/** Source the app installs for the agent to read, as it would a node module. */
export type KernelLibrary = {
  name: string
  version: string
  directory: string
  install: () => Promise<void>
}

/** What the agent is given for a project on one kernel. */
export type KernelProfile = {
  /** The kernel's section of the system prompt. */
  prompt: string
  /** Offered on top of the common tools. */
  tools: readonly KernelToolName[]
  library: KernelLibrary | null
}

/**
 * Keyed by every kernel the app supports, so adding one to
 * `SUPPORTED_CAD_KERNELS` does not compile until it has a profile here.
 *
 * The prompts are read at build time: `bun build --compile` bundles JavaScript
 * only, and a read left for runtime would fail in the standalone binary. Each
 * path is a literal because macro arguments must be.
 */
const KERNEL_PROFILES: Record<SupportedCADKernels, KernelProfile> = {
  replicad: {
    prompt: inlineFile('agent/kernels/replicad.md'),
    tools: [BUILD_TOOL_NAME],
    library: { name: 'replicad', ...replicadLibrary },
  },
  openscad: {
    prompt: inlineFile('agent/kernels/openscad.md'),
    tools: [BUILD_TOOL_NAME],
    library: null,
  },
  build123d: {
    prompt: inlineFile('agent/kernels/build123d.md'),
    tools: [BUILD_TOOL_NAME],
    library: null,
  },
}

export function kernelPrompt(kernel: SupportedCADKernels): string {
  return KERNEL_PROFILES[kernel].prompt.trim()
}

export function kernelLibrary(
  kernel: SupportedCADKernels,
): KernelLibrary | null {
  return KERNEL_PROFILES[kernel].library
}

export function offeredToolNames(kernel: SupportedCADKernels): ToolName[] {
  return [...COMMON_TOOL_NAMES, ...KERNEL_PROFILES[kernel].tools]
}
