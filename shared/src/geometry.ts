import { z } from 'zod'

const finiteSchema = z.number().finite()
const pointSchema = z.tuple([finiteSchema, finiteSchema, finiteSchema])

const measureSchema = z.object({
  name: z.string(),
  quantity: z.enum(['length', 'area', 'angle']),
  value: finiteSchema,
})
const vectorSchema = z.object({
  name: z.string(),
  quantity: z.enum(['point', 'direction']),
  value: pointSchema,
})
const labelSchema = z.object({
  name: z.string(),
  quantity: z.literal('label'),
  value: z.string(),
})
const facesSchema = z.object({
  name: z.string(),
  quantity: z.literal('faces'),
  value: z.array(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)),
})

/**
 * One named measurement of a face or an edge. The kernel decides which facts
 * an entity carries; `quantity` only says how a value is read - a point moves
 * with its part, a direction only turns with it, a length does neither.
 */
export const entityFactSchema = z.discriminatedUnion('quantity', [
  measureSchema,
  vectorSchema,
  labelSchema,
  facesSchema,
])
export type EntityFact = z.infer<typeof entityFactSchema>

/** A fact that still means something once the build it came from is gone. */
const referenceFactSchema = z.discriminatedUnion('quantity', [
  measureSchema,
  vectorSchema,
  labelSchema,
])
export type ReferenceFact = z.infer<typeof referenceFactSchema>

const referencedFaceSchema = z.object({
  type: z.string(),
  facts: z.array(referenceFactSchema),
})

/**
 * A face or edge the user pointed at, frozen when they pointed at it.
 *
 * The project rebuilds continuously, so nothing here points back into a build:
 * face and edge indices are the kernel's traversal order and have no
 * counterpart in the source the agent edits. The facts are what it matches
 * its code against, in world coordinates.
 */
export const geometryRefSchema = z.object({
  /** The placed part's name, as the part tree shows it. */
  part: z.string(),
  kind: z.enum(['face', 'edge']),
  /** The kernel's surface or curve type, e.g. 'PLANE' or 'CIRCLE'. */
  type: z.string(),
  facts: z.array(referenceFactSchema),
  adjacentFaces: z.array(referencedFaceSchema).optional(),
})
export type GeometryRef = z.infer<typeof geometryRefSchema>

export function isReferenceFact(fact: EntityFact): fact is ReferenceFact {
  return fact.quantity !== 'faces'
}

/** build123d's `GeomType` names are upper case: 'PLANE' reads as 'Plane'. */
export function geometryTypeLabel(type: string): string {
  return type.charAt(0) + type.slice(1).toLowerCase()
}

/** 'halfAngle' reads as 'Half angle'. */
export function factLabel(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function number(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

export function factValue(fact: EntityFact): string {
  switch (fact.quantity) {
    case 'length':
      return `${number(fact.value)} mm`
    case 'area':
      return `${number(fact.value)} mm²`
    case 'angle':
      return `${number(fact.value)}°`
    case 'point':
    case 'direction':
      return `(${fact.value.map(number).join(', ')})`
    case 'faces':
      return fact.value.join(', ')
    case 'label':
      return fact.value
  }
}

/**
 * An adjacent face is folded onto one line, so an edge reads as what it is
 * before the detail of what it sits between.
 */
export function geometryRefText(ref: GeometryRef): string {
  const lines = [
    `${factLabel(ref.kind)} of part "${ref.part}": ${geometryTypeLabel(ref.type)} (world coordinates)`,
    ...ref.facts.map((fact) => `- ${factLabel(fact.name)}: ${factValue(fact)}`),
  ]
  if (ref.adjacentFaces?.length) {
    lines.push('- Between faces:')
    for (const face of ref.adjacentFaces) {
      const facts = face.facts.map(
        (fact) => `${factLabel(fact.name).toLowerCase()} ${factValue(fact)}`,
      )
      lines.push(`  - ${geometryTypeLabel(face.type)}: ${facts.join(', ')}`)
    }
  }
  return lines.join('\n')
}
