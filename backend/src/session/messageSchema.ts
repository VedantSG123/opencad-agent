import z from 'zod'

const PartBaseSchema = z.object({
  id: z.string(),
  message_id: z.string(),
  session_id: z.string(),
})

export const TextPartSchema = PartBaseSchema.extend({
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

/**
 * The marker a compaction leaves behind. Everything it summarises stays in the
 * database untouched - only the projection into model messages starts here,
 * replaying the summary in place of the turns before it.
 */
const CompactionPartSchema = PartBaseSchema.extend({
  type: z.literal('compaction'),
  summary: z.string(),
  auto: z.boolean(),
  /** Where the replayed tail begins. Defaults to the message after this one. */
  tail_start_message_id: z.string().optional(),
})

export type CompactionPart = z.infer<typeof CompactionPartSchema>

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
  CompactionPartSchema,
])

export type Part = z.infer<typeof PartSchema>

export type TextPart = z.infer<typeof TextPartSchema>

export type ToolPart = z.infer<typeof ToolPartSchema>

export type ToolState = z.infer<typeof ToolSateSchema>

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
    /** Absent while the turn is still streaming, or if it was interrupted. */
    completed: z.string().optional(),
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

export type AssistantMessage = Extract<Message, { role: 'assistant' }>

export type UserMessage = Extract<Message, { role: 'user' }>
