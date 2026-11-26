import { z } from 'zod'

import type { GeometryRef } from './geometry.js'
import { geometryRefSchema, geometryRefText } from './geometry.js'

const partRefSchema = z.object({
  kind: z.literal('part'),
  /** The placed part's name, as the part tree shows it. */
  part: z.string(),
})

const fileRefSchema = z.object({
  kind: z.literal('file'),
  /** Relative to the project directory, as the agent's tools take it. */
  path: z.string().min(1),
})

export type PartRef = z.infer<typeof partRefSchema>

export const referenceSchema = z.discriminatedUnion('kind', [
  geometryRefSchema,
  partRefSchema,
  fileRefSchema,
])
export type Reference = z.infer<typeof referenceSchema>

export const messageReferenceSchema = z.object({
  id: z.number().int().positive(),
  ref: referenceSchema,
})
export type MessageReference = z.infer<typeof messageReferenceSchema>

export type PromptRun =
  | { type: 'text'; text: string }
  | { type: 'reference'; label: string; id: number }

const REFERENCE_PATH = '/opencad-reference'

const LINK = /\[((?:\\.|[^\\\]])*)\]\(\/opencad-reference\?refId=(\d+)\)/g

export function referenceLink(label: string, id: number): string {
  const escaped = label.replace(/[\\[\]]/g, '\\$&')
  return `[${escaped}](${REFERENCE_PATH}?refId=${id})`
}

export function parsePrompt(text: string): PromptRun[] {
  const runs: PromptRun[] = []
  let from = 0
  for (const match of text.matchAll(LINK)) {
    if (match.index > from) {
      runs.push({ type: 'text', text: text.slice(from, match.index) })
    }
    runs.push({
      type: 'reference',
      label: (match[1] ?? '').replace(/\\(.)/g, '$1'),
      id: Number(match[2]),
    })
    from = match.index + match[0].length
  }
  if (from < text.length) runs.push({ type: 'text', text: text.slice(from) })
  return runs
}

/** The text with each link read as its label, for a chat title. */
export function plainPrompt(text: string): string {
  return parsePrompt(text)
    .map((run) => (run.type === 'text' ? run.text : run.label))
    .join('')
}

export function referencesRefusal(
  text: string,
  references: MessageReference[],
): string | null {
  const ids = new Set(references.map((reference) => reference.id))
  if (ids.size !== references.length) {
    return 'Two references share an id.'
  }
  const linked = new Set(
    parsePrompt(text).flatMap((run) =>
      run.type === 'reference' ? [run.id] : [],
    ),
  )
  if ([...linked].some((id) => !ids.has(id))) {
    return 'The message links a reference it does not carry.'
  }
  if (references.some((reference) => !linked.has(reference.id))) {
    return 'The message carries a reference it never links.'
  }
  return null
}

/**
 * The prompt as the model reads it. A query-string link is noise to a model,
 * so a link becomes `[edge 1]`, its details follow the text in a matching
 * `<reference id="1">` block, and a file is just its path.
 */
export function promptForModel(
  text: string,
  references: MessageReference[],
): string {
  const byId = new Map(references.map((reference) => [reference.id, reference]))
  const sentence = parsePrompt(text)
    .map((run) => {
      if (run.type === 'text') return run.text
      const ref = byId.get(run.id)?.ref
      if (!ref) return run.label
      return ref.kind === 'file' ? ref.path : `[${ref.kind} ${run.id}]`
    })
    .join('')
  const ordered = [...references].sort((a, b) => a.id - b.id)
  const blocks = ordered.flatMap(({ id, ref }) =>
    ref.kind === 'file'
      ? []
      : [`<reference id="${id}">\n${referenceText(ref)}\n</reference>`],
  )
  return [sentence, ...blocks].join('\n\n')
}

export function referenceText(ref: GeometryRef | PartRef): string {
  return ref.kind === 'part' ? `Part "${ref.part}"` : geometryRefText(ref)
}
