import { name } from 'eslint-plugin-prettier/recommended'
import z from 'zod'

export const Model = z.object({
  id: z.string(),
  providerId: z.string(),
  name: z.string(),
  family: z.string().optional(),
  api: z.object({
    id: z.string(),
    url: z.string(),
    npm: z.string(),
  }),
  capabilities: z.object({
    temperature: z.boolean(),
    reasoning: z.boolean(),
    attachment: z.boolean(),
    toolcall: z.boolean(),
    input: z.object({
      text: z.boolean(),
      audio: z.boolean(),
      image: z.boolean(),
      video: z.boolean(),
      pdf: z.boolean(),
    }),
    output: z.object({
      text: z.boolean(),
      audio: z.boolean(),
      image: z.boolean(),
      video: z.boolean(),
      pdf: z.boolean(),
    }),
    interlaved: z.union([
      z.boolean(),
      z.object({
        field: z.enum(['reasoning_content', 'reasoning_details']),
      }),
    ]),
  }),
  limit: z.object({
    context: z.number(),
    input: z.number().optional(),
    output: z.number(),
  }),
  status: z.enum(['alpha', 'beta', 'deprecated', 'active']).optional(),
  release_date: z.string(),
})

export type Model = z.infer<typeof Model>

export const Provider = z.object({
  id: z.string(),
  name: z.string(),
  env: z.array(z.string()).optional(),
  options: z.record(z.string(), z.any()),
  models: z.record(z.string(), Model),
})

export type Provider = z.infer<typeof Provider>
