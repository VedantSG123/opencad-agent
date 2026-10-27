import { isAxiosError } from 'axios'
import { useState } from 'react'

import { useAgentBuilder } from '@/hooks/useAgentBuilds'
import { createBuildHandler } from '@/lib/agentBuilds'
import { createAgentDataHandler } from '@/lib/agentData'
import axiosInstance from '@/lib/axios'

export function useAgentData(sessionId: string) {
  const builder = useAgentBuilder()
  const [onData] = useState(() =>
    createAgentDataHandler(
      createBuildHandler({
        builder,
        postReport: async (toolCallId, report) => {
          try {
            await axiosInstance.post(
              `/sessions/${sessionId}/builds/${toolCallId}`,
              report,
            )
          } catch (error) {
            if (isAxiosError(error) && error.response?.status === 404) return
            throw error
          }
        },
      }),
    ),
  )
  return onData
}
