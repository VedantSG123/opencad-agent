import path from 'node:path'

import type { BuildLog, BuildReport, OpenSCADBuildRequest } from 'shared'

import type { CompileResult } from './OpenSCADWrapper.js'

const locationPattern = /\bin file (.+), line (\d+)/i

export function remapOpenSCADDiagnostic(
  text: string,
  runDirectory: string,
  mainFile: string,
): string {
  if (!/^(ERROR:|WARNING:|TRACE:)/i.test(text)) return text
  const match = locationPattern.exec(text)
  if (!match) return text
  const filename = match[1].replace(/^"|"$/g, '')
  for (const candidate of [
    path.resolve(filename),
    path.resolve(path.dirname(mainFile), filename),
  ]) {
    const relative = path.relative(runDirectory, candidate)
    if (
      !relative.startsWith('..' + path.sep) &&
      relative !== '..' &&
      !path.isAbsolute(relative)
    ) {
      return text.replace(match[1], '/' + relative.split(path.sep).join('/'))
    }
  }
  return text
}

export function openSCADBuildReport(
  result: CompileResult,
  request: OpenSCADBuildRequest,
  durationMs: number,
): BuildReport {
  const logs: BuildLog[] = [
    ...result.stdout.map((text) => ({ level: 'log' as const, text })),
    ...result.stderr.map((text) => ({
      level: /^ERROR:/i.test(text)
        ? ('error' as const)
        : /^WARNING:/i.test(text)
          ? ('warn' as const)
          : /^ECHO:/i.test(text)
            ? ('log' as const)
            : ('info' as const),
      text,
    })),
  ]
  if (result.error || !result.blob?.byteLength || !result.format) {
    const errors = result.stderr.filter((line) => /^ERROR:/i.test(line))
    const message =
      errors.join('\n') ||
      result.stderr.join('\n') ||
      'The compiler produced no geometry.'
    const match = locationPattern.exec(errors[0] ?? '')
    const line =
      match && match[1].replace(/^"|"$/g, '') === '/' + request.file
        ? Number(match[2])
        : undefined
    return {
      status: 'failed',
      durationMs,
      logs,
      error: {
        message,
        ...(line && Number.isSafeInteger(line) ? { line } : {}),
      },
    }
  }
  return {
    status: 'succeeded',
    durationMs,
    logs,
    shapes: [
      {
        name: request.file,
        kind: result.format === 'svg' ? '2d' : '3d',
        rendered: true,
      },
    ],
    ...(result.geometry === undefined ? {} : { geometry: result.geometry }),
  }
}
