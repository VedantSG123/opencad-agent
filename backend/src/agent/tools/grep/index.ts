import { existsSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

import { tool } from 'ai'
import { z } from 'zod'

import { logger } from '../../../utils/logger'
import type { ToolContext } from '../types'
import {
  formatContentResults,
  formatCountResults,
  formatFileListResults,
  parseCounts,
  parseFileList,
} from './formatResults'
import { parseRipgrepJson } from './parseRipgrepJson'
import { prompt } from './prompt'
import { RG_EXIT_NO_MATCH, runRipgrep } from './runRipgrep'

const OUTPUT_MODES = ['filesWithMatches', 'content', 'count'] as const

type OutputMode = (typeof OUTPUT_MODES)[number]

const DEFAULT_HEAD_LIMIT: Record<OutputMode, number> = {
  filesWithMatches: 100,
  content: 200,
  count: 100,
}

const TIMEOUT_MS = 30_000
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024

// Every field is optional rather than defaulted: some providers reject JSON
// Schema `default` keywords in tool definitions, so defaults are applied below.
const grepInputSchema = z.object({
  pattern: z
    .string()
    .min(1)
    .describe(
      'Rust regex to search for, e.g. "makeCylinder\\\\(" or "export (const|function) \\\\w+".',
    ),
  path: z
    .string()
    .optional()
    .describe(
      'File or directory to search in, relative to the project directory. Defaults to the whole project.',
    ),
  glob: z
    .string()
    .optional()
    .describe(
      'Glob filter, e.g. "*.scad" or "src/**/*.{js,ts}". Prefix with "!" to exclude instead.',
    ),
  type: z
    .string()
    .optional()
    .describe(
      'ripgrep file type filter, e.g. "js", "ts", "py", "md". Cheaper than an equivalent glob.',
    ),
  outputMode: z
    .enum(OUTPUT_MODES)
    .optional()
    .describe(
      'filesWithMatches (default): matching file paths only. content: matching lines. count: number of matching lines per file.',
    ),
  caseInsensitive: z
    .boolean()
    .optional()
    .describe('Match case-insensitively. Defaults to false.'),
  multiline: z
    .boolean()
    .optional()
    .describe(
      'Let the pattern span multiple lines ("." also matches newlines). Defaults to false.',
    ),
  contextLines: z
    .number()
    .int()
    .min(0)
    .max(20)
    .optional()
    .describe(
      'Lines of surrounding context to include around each match. Only used with outputMode "content".',
    ),
  includeIgnored: z
    .boolean()
    .optional()
    .describe(
      'Also search hidden files and files excluded by .gitignore (dependencies, build output, dotfiles). Defaults to false.',
    ),
  headLimit: z
    .number()
    .int()
    .min(1)
    .max(2000)
    .optional()
    .describe(
      'Maximum number of output lines (content mode) or files (other modes) to return.',
    ),
})

export type GrepInput = z.infer<typeof grepInputSchema>

export function createGrepTool(context: ToolContext) {
  return tool({
    description: prompt,
    inputSchema: grepInputSchema,
    execute: async (input, options): Promise<string> => {
      try {
        return await grep(input, context, options?.abortSignal)
      } catch (error) {
        logger.error({ error, input }, 'grep tool failed')
        return `Error running search: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

export async function grep(
  input: GrepInput,
  context: ToolContext,
  abortSignal: AbortSignal | undefined,
): Promise<string> {
  const outputMode: OutputMode = input.outputMode ?? 'filesWithMatches'
  const headLimit = input.headLimit ?? DEFAULT_HEAD_LIMIT[outputMode]

  const root = path.resolve(context.workingDirectory)
  if (!isDirectory(root)) {
    return `Error: the project directory "${root}" does not exist or is not a directory.`
  }

  const resolved = resolveSearchPath(root, input.path)
  if ('error' in resolved) return resolved.error

  const run = await runRipgrep({
    args: buildArgs(input, outputMode, resolved.searchArg),
    cwd: root,
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_OUTPUT_BYTES,
    abortSignal,
  })

  if (run.timedOut) {
    return `Error: the search timed out after ${TIMEOUT_MS / 1000}s. Narrow it down with \`path\`, \`glob\` or \`type\`, or use a more specific pattern.`
  }

  // In `--json` mode ripgrep prints a summary event even when nothing matched,
  // so emptiness has to be decided from the parsed results, not from stdout.
  const body = renderOutput(run.stdout, outputMode, headLimit)

  if (body === null) {
    const failed = run.exitCode !== 0 && run.exitCode !== RG_EXIT_NO_MATCH
    return failed
      ? `Error: ripgrep exited with code ${run.exitCode ?? 'null'}.\n${firstLines(run.stderr, 5) || '(no error output)'}`
      : describeNoMatches(input, resolved.searchArg)
  }

  const notes: string[] = []

  if (run.outputTruncated) {
    notes.push(
      'ripgrep produced more output than could be buffered; results are incomplete.',
    )
  }
  // Exit code 2 alongside results means some paths were skipped (permissions,
  // unreadable files) - the results themselves are still valid.
  if (run.exitCode !== 0 && run.exitCode !== RG_EXIT_NO_MATCH && run.stderr) {
    notes.push(firstLines(run.stderr, 3))
  }

  return notes.length > 0 ? `${body}\n\n[Warning: ${notes.join(' ')}]` : body
}

function buildArgs(
  input: GrepInput,
  outputMode: OutputMode,
  searchArg: string | null,
): string[] {
  const args = [
    // Ignore any RIPGREP_CONFIG_PATH the user happens to have set.
    '--no-config',
    '--color',
    'never',
    // Report `/` separators on Windows too.
    '--path-separator',
    '/',
    // Retries with PCRE2 when the default engine rejects the pattern, so
    // lookarounds and backreferences work.
    '--engine',
    'auto',
  ]

  if (input.caseInsensitive) args.push('--ignore-case')
  if (input.multiline) args.push('--multiline', '--multiline-dotall')
  if (input.type) args.push('--type', input.type)
  if (input.glob) args.push('--glob', input.glob)

  if (input.includeIgnored) {
    args.push('--hidden', '--no-ignore', '--glob', '!.git/')
  } else {
    // Without this, ripgrep only honours .gitignore inside a git repository,
    // so node_modules and build output would flood searches of a plain folder.
    args.push('--no-require-git')
  }

  switch (outputMode) {
    case 'content':
      args.push('--json')
      if (input.contextLines) args.push('--context', String(input.contextLines))
      break
    case 'filesWithMatches':
      args.push('--files-with-matches')
      break
    case 'count':
      // Without this, ripgrep prints a bare count when searching a single
      // file, which parseCounts cannot attribute to a path.
      args.push('--count', '--with-filename')
      break
  }

  // `-e` keeps a pattern that starts with "-" from being read as a flag.
  args.push('-e', input.pattern)
  if (searchArg) args.push('--', searchArg)

  return args
}

function renderOutput(
  stdout: string,
  outputMode: OutputMode,
  headLimit: number,
): string | null {
  switch (outputMode) {
    case 'content': {
      const parsed = parseRipgrepJson(stdout)
      if (parsed.files.length === 0) return null
      parsed.files.sort((a, b) => a.path.localeCompare(b.path))
      return formatContentResults(parsed, headLimit)
    }
    case 'filesWithMatches': {
      const files = parseFileList(stdout).sort((a, b) => a.localeCompare(b))
      if (files.length === 0) return null
      return formatFileListResults(files, headLimit)
    }
    case 'count': {
      const counts = parseCounts(stdout).sort((a, b) =>
        a.path.localeCompare(b.path),
      )
      if (counts.length === 0) return null
      return formatCountResults(counts, headLimit)
    }
  }
}

function resolveSearchPath(
  root: string,
  requested: string | undefined,
): { searchArg: string | null } | { error: string } {
  if (!requested || requested === '.' || requested === './') {
    return { searchArg: null }
  }

  const target = path.resolve(root, requested)
  const relative = path.relative(root, target)
  const outsideError = {
    error: `Error: "${requested}" is outside the project directory. Only paths inside the project can be searched.`,
  }

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return outsideError
  }

  if (relative === '') return { searchArg: null }

  if (!existsSync(target)) {
    return { error: `Error: path not found: ${toPosix(relative)}` }
  }

  // A symlink inside the project can still point outside it. ripgrep does not
  // follow symlinks while walking, so this only has to cover the path the
  // model asked for explicitly.
  const realRelative = path.relative(realPath(root), realPath(target))
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    return outsideError
  }

  // Built from the lexical path, not the resolved one, because ripgrep runs
  // with the project directory as its cwd.
  return { searchArg: toPosix(relative) }
}

function realPath(target: string): string {
  try {
    return realpathSync(target)
  } catch {
    return target
  }
}

function describeNoMatches(input: GrepInput, searchArg: string | null): string {
  const filters = [
    searchArg ? `in ${searchArg}` : 'in the project directory',
    input.glob ? `matching glob "${input.glob}"` : null,
    input.type ? `of type "${input.type}"` : null,
  ].filter(Boolean)

  const hint = input.includeIgnored
    ? ''
    : ' Hidden files and .gitignore-excluded files were skipped - retry with `includeIgnored: true` to search those too.'

  return `No matches found for pattern "${input.pattern}" ${filters.join(' ')}.${hint}`
}

function firstLines(text: string, count: number): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, count)
    .join(' ')
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/')
}

function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory()
  } catch {
    return false
  }
}
