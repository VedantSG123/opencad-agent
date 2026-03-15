import z from 'zod'

export const SessionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  title: z.string(),
  time: z.object({
    created: z.string(),
    updated: z.string(),
  }),
})

export type Session = z.infer<typeof SessionSchema>
