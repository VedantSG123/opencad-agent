import z from 'zod'

const PartBaseSchema = z.object({
  id: z.string(),
  message_id: z.string(),
  session_id: z.string(),
})

const TextPartSchema = PartBaseSchema.extend({
  type: z.literal('text'),
  text: z.string(),
  synthetic: z.boolean().optional(),
})

export const FilePartSchema = PartBaseSchema.extend({
  type: z.literal('file'),
  mime: z.string(), // e.g. 'image/png', 'image/jpeg'
  url: z.string(), // URL or base64 data URI
  filename: z.string().optional(), // original filename if available
})

export type FilePart = z.infer<typeof FilePartSchema>

const ToolStatePending = z.object({
  state: z.literal('pending'),
  input: z.record(z.string(), z.any()),
})

const ToolStateRunning = z.object({
  state: z.literal('running'),
  input: z.record(z.string(), z.any()),
  time: z.object({
    started: z.string(),
  }),
})

const ToolStateCompleted = z.object({
  state: z.literal('completed'),
  input: z.record(z.string(), z.any()),
  output: z.string(),
  time: z.object({
    started: z.string(),
    completed: z.string(),
  }),
})

const ToolStateError = z.object({
  state: z.literal('error'),
  input: z.record(z.string(), z.any()),
  error: z.string(),
  time: z.object({
    started: z.string(),
    completed: z.string(),
  }),
})

const ToolSateSchema = z.discriminatedUnion('state', [
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
])

const ToolPartSchema = PartBaseSchema.extend({
  type: z.literal('tool'),
  call_id: z.string(),
  tool: z.string(),
  state: ToolSateSchema,
  metadata: z.record(z.string(), z.any()).optional(),
})

export const PartSchema = z.discriminatedUnion('type', [
  TextPartSchema,
  FilePartSchema,
  ToolPartSchema,
])

export type Part = z.infer<typeof PartSchema>

const BaseMessageSchema = z.object({
  id: z.string(),
  session_id: z.string(),
})

const UserMessageSchema = BaseMessageSchema.extend({
  role: z.literal('user'),
  model: z.object({
    model_id: z.string(),
    provider_id: z.string(),
  }),
  time: z.object({
    created: z.string(),
  }),
})

const AssistantMessageSchema = BaseMessageSchema.extend({
  role: z.literal('assistant'),
  time: z.object({
    created: z.string(),
    completed: z.string(),
  }),
  model: z.object({
    model_id: z.string(),
    provider_id: z.string(),
  }),
})

export const MessageSchema = z.discriminatedUnion('role', [
  UserMessageSchema,
  AssistantMessageSchema,
])

export type Message = z.infer<typeof MessageSchema>
