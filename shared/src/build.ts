import { z } from 'zod'

/** What the backend asks the app to build: the source as it is on disk. */
export type BuildRequest = {
  /** Relative to the project directory. */
  file: string
  source: string
}

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
