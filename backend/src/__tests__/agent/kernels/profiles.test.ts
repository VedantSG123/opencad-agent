import { describe, expect, test } from 'bun:test'

import { kernelPrompt, offeredToolNames } from '../../../agent/kernels'
import { buildSystemPrompt } from '../../../agent/prompt/system'
import { createTools } from '../../../agent/tools'
import {
  BUILD_TOOL_NAME,
  COMMON_TOOL_NAMES,
  GET_API_DOCUMENTATION_TOOL_NAME,
} from '../../../agent/tools/names'
import { SUPPORTED_CAD_KERNELS } from '../../../cad'
import type { SupportedCADKernels } from '../../../cad'
import type { Project } from '../../../project/schema'

const KERNELS = SUPPORTED_CAD_KERNELS.options

const noBuilds = () =>
  Promise.resolve({
    status: 'unavailable' as const,
    reason: 'not in this test',
  })

function project(kernel: SupportedCADKernels): Project {
  return {
    id: 'prj_test',
    name: 'Test',
    cad_kernel: kernel,
    directory: '/tmp/test',
    file: null,
    preferences: { permissions: { rules: [] } },
    time: { created: 'now', updated: 'now', accessed: null },
  }
}

describe('kernel prompts', () => {
  test('every kernel has one, read in at build time', () => {
    for (const kernel of KERNELS) {
      // A missing or misnamed file fails the macro outright; this catches one
      // that exists but was left empty.
      expect(kernelPrompt(kernel)).toMatch(/^## /)
    }
  })

  test('the system prompt carries the project’s kernel and no other', () => {
    const prompt = buildSystemPrompt(project('build123d'))

    expect(prompt).toContain(kernelPrompt('build123d'))
    expect(prompt).not.toContain(kernelPrompt('replicad'))
    expect(prompt).not.toContain(kernelPrompt('openscad'))
  })

  test('build123d is told the one thing its examples get wrong', () => {
    // Most build123d examples import `show` from ocp_vscode, which would
    // replace the app's and leave the viewport empty.
    expect(kernelPrompt('build123d')).toContain('ocp_vscode')
  })
})

describe('tool allowance', () => {
  test('every kernel is offered the common tools', () => {
    for (const kernel of KERNELS) {
      for (const name of COMMON_TOOL_NAMES) {
        expect(offeredToolNames(kernel)).toContain(name)
      }
    }
  })

  test('the replicad documentation store is offered to replicad alone', () => {
    for (const kernel of KERNELS) {
      expect(
        offeredToolNames(kernel).includes(GET_API_DOCUMENTATION_TOOL_NAME),
      ).toBe(kernel === 'replicad')
    }
  })

  test('only replicad can build until another kernel answers builds', () => {
    // The app answers a build with the kernel the project is open in; a
    // kernel with no builder there would leave every build unavailable.
    for (const kernel of KERNELS) {
      expect(offeredToolNames(kernel).includes(BUILD_TOOL_NAME)).toBe(
        kernel === 'replicad',
      )
    }
  })

  test('createTools hands the model exactly what the profile offers', () => {
    for (const kernel of KERNELS) {
      const tools = createTools(
        {
          projectDirectory: '/tmp/test',
          guardFor: () => ({ refusalFor: () => null }),
        },
        project(kernel),
        noBuilds,
      )

      expect(Object.keys(tools).sort()).toEqual(
        [...offeredToolNames(kernel)].sort(),
      )
    }
  })

  test('no common tool’s description names a kernel-only tool', () => {
    // A common tool that points at a kernel-only one sends every other
    // kernel's agent to call something it was never given.
    const tools = createTools(
      {
        projectDirectory: '/tmp/test',
        guardFor: () => ({ refusalFor: () => null }),
      },
      project('openscad'),
      noBuilds,
    )

    for (const name of COMMON_TOOL_NAMES) {
      expect(tools[name]?.description).not.toContain(
        GET_API_DOCUMENTATION_TOOL_NAME,
      )
    }
  })
})
