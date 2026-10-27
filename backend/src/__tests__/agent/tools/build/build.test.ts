import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { buildReportSchema } from 'shared'
import type { BuildReport, BuildRequest, GeometrySummary } from 'shared'

import { build } from '../../../../agent/tools/build'
import type { BuildRequester } from '../../../../agent/tools/build'
import { toolFailed } from '../../../../agent/tools/types'

const SOURCE = [
  'const main = () => {',
  '  const base = drawRectangle(10, 20)',
  '  return base.sketchOnPlane().extrude(nope)',
  '}',
  '',
].join('\n')

let project: string

beforeEach(async () => {
  project = await mkdtemp(path.join(tmpdir(), 'build-tool-'))
  await writeFile(path.join(project, 'main.js'), SOURCE)
})

afterEach(async () => {
  await rm(project, { recursive: true, force: true })
})

function answering(report: BuildReport): {
  requester: BuildRequester
  asked: BuildRequest[]
} {
  const asked: BuildRequest[] = []
  return {
    asked,
    requester: (request) => {
      asked.push(request)
      return Promise.resolve(report)
    },
  }
}

function run(requester: BuildRequester, mainFile: string | null = 'main.js') {
  return build(
    { workingDirectory: project, mainFile, requestBuild: requester },
    'call_1',
  )
}

describe('what the app is asked to build', () => {
  test('geometry measurements are requested only when opted in', async () => {
    const { requester, asked } = answering({
      status: 'succeeded',
      durationMs: 5,
      shapes: [],
      logs: [],
    })
    await run(requester)
    await build(
      {
        workingDirectory: project,
        mainFile: 'main.js',
        requestBuild: requester,
      },
      'call_2',
      { geometrySummary: true },
    )
    expect(asked).toEqual([
      { file: 'main.js', source: SOURCE },
      { file: 'main.js', source: SOURCE, geometrySummary: true },
    ])
  })
  test('the main file as saved on disk', async () => {
    const { requester, asked } = answering({
      status: 'succeeded',
      durationMs: 5,
      shapes: [],
      logs: [],
    })

    await run(requester)

    expect(asked).toEqual([{ file: 'main.js', source: SOURCE }])
  })

  test('a main file stored as an absolute path, named relative to the project', async () => {
    const { requester, asked } = answering({
      status: 'succeeded',
      durationMs: 5,
      shapes: [],
      logs: [],
    })

    await run(requester, path.join(project, 'main.js'))

    expect(asked).toEqual([{ file: 'main.js', source: SOURCE }])
  })

  test('nothing, when the project has no main file', async () => {
    const { requester, asked } = answering({
      status: 'unavailable',
      reason: 'unused',
    })

    const output = await run(requester, null)

    expect(asked).toEqual([])
    expect(output).toBe(
      'Error: this project has no main file set, so there is nothing to build. Ask the user to choose one.',
    )
  })

  test('nothing, when the main file is missing', async () => {
    const { requester, asked } = answering({
      status: 'unavailable',
      reason: 'unused',
    })

    const output = await run(requester, 'gone.js')

    expect(asked).toEqual([])
    expect(output).toBe('Error: the main file gone.js does not exist.')
  })
})

describe('what the model reads back', () => {
  test('requested measurements survive report validation and reach the model', async () => {
    const bounds = { min: [0, 0, 0], max: [10, 20, 30] } satisfies NonNullable<
      GeometrySummary['overall']
    >['bounds']
    const geometry: GeometrySummary = {
      parts: [
        {
          kind: '3d',
          name: 'bracket',
          bounds,
          solidCount: 1,
          valid: true,
          shellsClosed: true,
          surfaceArea: 2200,
          volume: 6000,
          centerOfMass: [5, 10, 15],
        },
      ],
      overall: { bounds, solidCount: 1, volumeSum: 6000, surfaceAreaSum: 2200 },
    }
    const report = buildReportSchema.parse({
      status: 'succeeded',
      durationMs: 10,
      shapes: [],
      logs: [],
      geometry,
    })
    const { requester } = answering(report)
    const output = await run(requester)
    expect(output).toContain('Geometry summary')
    expect(output).toContain('size [10, 20, 30]')
    expect(output).toContain('sum of part volumes 6000')
    expect(output).toContain('solids 1; valid true; shells closed true')
    expect(output).toContain('centre of mass [5, 10, 15]')
    expect(toolFailed(output)).toBe(false)
  })

  test('geometry analysis failure is reported without failing a successful build', async () => {
    const { requester } = answering({
      status: 'succeeded',
      durationMs: 10,
      shapes: [{ name: 'bracket', kind: '3d', rendered: true }],
      logs: [],
      geometry: {
        parts: [
          {
            name: 'bracket',
            kind: 'unavailable',
            reason: 'Could not measure this shape.',
          },
        ],
        overall: null,
      },
    })
    const output = await run(requester)
    expect(output).toContain('Built main.js')
    expect(output).toContain(
      'geometry analysis unavailable: Could not measure this shape.',
    )
    expect(toolFailed(output)).toBe(false)
  })
  test('a failure points at the line in the main file', async () => {
    const { requester } = answering({
      status: 'failed',
      durationMs: 1250,
      error: { message: 'nope is not defined', line: 3, column: 41 },
      logs: [{ level: 'log', text: 'base ready' }],
    })

    const output = await run(requester)

    expect(output).toBe(
      [
        'Build failed after 1.25s: main.js line 3, column 41: nope is not defined',
        '',
        '  1 | const main = () => {',
        '  2 |   const base = drawRectangle(10, 20)',
        '> 3 |   return base.sketchOnPlane().extrude(nope)',
        '  4 | }',
        '  5 | ',
        '',
        'Console output (1 line):',
        '[log] base ready',
      ].join('\n'),
    )
    // The code is wrong, but the tool did its job; the loop must not record
    // the call itself as failed.
    expect(toolFailed(output)).toBe(false)
  })

  test('a failure the kernel could not place names only the file', async () => {
    const { requester } = answering({
      status: 'failed',
      durationMs: 40,
      error: { message: 'BRep_API: command not done' },
      logs: [],
    })

    expect(await run(requester)).toBe(
      'Build failed after 0.04s: main.js: BRep_API: command not done',
    )
  })

  test('a success lists the shapes, flagging one that could not be drawn', async () => {
    const { requester } = answering({
      status: 'succeeded',
      durationMs: 800,
      shapes: [
        { name: 'bracket', kind: '3d', rendered: true },
        { name: 'outline', kind: '2d', rendered: true },
        { name: 'gusset', kind: '3d', rendered: false },
      ],
      logs: [],
    })

    expect(await run(requester)).toBe(
      [
        'Built main.js in 0.80s. 3 shapes:',
        '- "bracket" (3D)',
        '- "outline" (2D)',
        '- "gusset" (3D) - built, but could not be drawn',
      ].join('\n'),
    )
  })

  test('a success with nothing to show says so', async () => {
    const { requester } = answering({
      status: 'succeeded',
      durationMs: 10,
      shapes: [],
      logs: [],
    })

    expect(await run(requester)).toBe(
      'Built main.js in 0.01s, but it produced no shapes to render.',
    )
  })

  test('long console output keeps its tail', async () => {
    const logs = Array.from({ length: 50 }, (_, index) => ({
      level: 'log' as const,
      text: `line ${index + 1}`,
    }))
    const { requester } = answering({
      status: 'succeeded',
      durationMs: 10,
      shapes: [],
      logs,
    })

    const output = await run(requester)

    expect(output).toContain('Console output (50 lines, first 10 omitted):')
    expect(output).not.toContain('[log] line 10\n')
    expect(output.endsWith('[log] line 50')).toBe(true)
  })

  test('an app that could not build is a failed call', async () => {
    const { requester } = answering({
      status: 'unavailable',
      reason: 'the app did not answer within 2 minutes.',
    })

    const output = await run(requester)

    expect(output).toBe(
      'Error: main.js was not built: the app did not answer within 2 minutes.',
    )
    expect(toolFailed(output)).toBe(true)
  })
})
