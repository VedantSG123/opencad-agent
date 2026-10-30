import { z } from 'zod'

export const buildOptionsSchema = z.object({
  geometrySummary: z
    .boolean()
    .optional()
    .describe(
      'Request the kernel’s available geometry measurements. Omit for appearance-only changes.',
    ),
})

export type BuildOptions = z.infer<typeof buildOptionsSchema>

/** What the backend asks the app to build: the source as it is on disk. */
export type BuildRequest = {
  /** Relative to the project directory. */
  file: string
  source: string
} & BuildOptions

export const openSCADBuildRequestSchema = buildOptionsSchema.extend({
  file: z.string().min(1),
  source: z.string(),
  projectDirectory: z.string().min(1),
})

export type OpenSCADBuildRequest = z.infer<typeof openSCADBuildRequestSchema>

const point3Schema = z.tuple([z.number(), z.number(), z.number()])
const point2Schema = z.tuple([z.number(), z.number()])

const bounds3Schema = z.object({ min: point3Schema, max: point3Schema })
const bounds2Schema = z.object({ min: point2Schema, max: point2Schema })

export const openSCADDrawingSummarySchema = z.object({
  geometry: z.object({
    dimensions: z.literal(2),
    bounding_box: bounds2Schema,
  }),
})

const geometryPartSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('mesh'),
    name: z.string(),
    bounds: bounds3Schema,
    vertexCount: z.number().int().nonnegative(),
    faceCount: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('3d'),
    name: z.string(),
    bounds: bounds3Schema,
    solidCount: z.number().int().nonnegative(),
    valid: z.boolean(),
    shellsClosed: z.boolean().nullable(),
    surfaceArea: z.number().nonnegative().nullable(),
    volume: z.number().nonnegative().nullable(),
    centerOfMass: point3Schema.nullable(),
  }),
  z.object({
    kind: z.literal('2d'),
    name: z.string(),
    bounds: bounds2Schema,
  }),
  z.object({
    kind: z.literal('unavailable'),
    name: z.string(),
    reason: z.string(),
  }),
])

export const geometrySummarySchema = z.object({
  parts: z.array(geometryPartSchema),
  overall: z
    .object({
      bounds: bounds3Schema,
      solidCount: z.number().int().nonnegative(),
      volumeSum: z.number().nonnegative().nullable(),
      surfaceAreaSum: z.number().nonnegative().nullable(),
    })
    .nullable(),
})

export type GeometrySummary = z.infer<typeof geometrySummarySchema>
export type GeometryPart = GeometrySummary['parts'][number]

export const buildLogSchema = z.object({
  level: z.enum(['log', 'info', 'warn', 'error']),
  text: z.string(),
})

export type BuildLog = z.infer<typeof buildLogSchema>

export const builtShapeSchema = z.object({
  name: z.string(),
  kind: z.enum(['3d', '2d']),
  /** False when the kernel produced the shape but it could not be drawn. */
  rendered: z.boolean(),
})

export type BuiltShape = z.infer<typeof builtShapeSchema>

/**
 * The answer to a `BuildRequest`. `line` and `column` count in the requested
 * file, not in whatever the kernel wrapped it in - only the app knows that
 * wrapping, so it is the app that maps them.
 */
export const buildReportSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('succeeded'),
    durationMs: z.number().nonnegative(),
    shapes: z.array(builtShapeSchema),
    logs: z.array(buildLogSchema),
    geometry: geometrySummarySchema.optional(),
  }),
  z.object({
    status: z.literal('failed'),
    durationMs: z.number().nonnegative(),
    error: z.object({
      message: z.string(),
      line: z.number().int().positive().optional(),
      column: z.number().int().positive().optional(),
    }),
    logs: z.array(buildLogSchema),
  }),
  z.object({
    status: z.literal('unavailable'),
    reason: z.string(),
  }),
])

export type BuildReport = z.infer<typeof buildReportSchema>

/** The payload of the `data-build` part on the agent stream. */
export type BuildPrompt = {
  toolCallId: string
  request: BuildRequest
  /** Set once answered, so a reconnecting client does not build it again. */
  report?: BuildReport
}
