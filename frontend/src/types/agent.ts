import type { DataUIPart, UIMessage } from 'ai'
import type { AgentUIDataTypes, AgentUIMetadata } from 'shared'

export type AgentUIMessage = UIMessage<AgentUIMetadata, AgentUIDataTypes>

export type AgentUIDataPart = DataUIPart<AgentUIDataTypes>

export type AgentUIPart = AgentUIMessage['parts'][number]

export interface AgentSession {
  id: string
  project_id: string
  title: string
  time: {
    created: string
    updated: string
  }
}

export interface AgentSessionDetail {
  session: AgentSession
  messages: AgentUIMessage[]
  running: boolean
}
