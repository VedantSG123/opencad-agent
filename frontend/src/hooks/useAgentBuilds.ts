import { createContext, useContext } from 'react'

import type { AgentBuilder } from '@/lib/agentBuilds'

const AgentBuilderContext = createContext<AgentBuilder | null>(null)

export const AgentBuilderProvider = AgentBuilderContext.Provider

export function useAgentBuilder(): AgentBuilder | null {
  return useContext(AgentBuilderContext)
}
