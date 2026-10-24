import type { SupportedCADKernels } from '../../cad'
import { inlineFile } from '../../utils/macro' with { type: 'macro' }
import { BUILD_TOOL_NAME, COMMON_TOOL_NAMES } from '../tools/names'
import type { KernelToolName, ToolName } from '../tools/names'

/** What the agent is given for a project on one kernel. */
export type KernelProfile = {
  /** The kernel's section of the system prompt. */
  prompt: string
  /** Offered on top of the common tools. */
  tools: readonly KernelToolName[]
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
  },
  openscad: {
    prompt: inlineFile('agent/kernels/openscad.md'),
    tools: [],
  },
  build123d: {
    prompt: inlineFile('agent/kernels/build123d.md'),
    tools: [],
  },
}

export function kernelPrompt(kernel: SupportedCADKernels): string {
  return KERNEL_PROFILES[kernel].prompt.trim()
}

export function offeredToolNames(kernel: SupportedCADKernels): ToolName[] {
  return [...COMMON_TOOL_NAMES, ...KERNEL_PROFILES[kernel].tools]
}
