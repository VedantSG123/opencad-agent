import type { BuildPrompt } from 'shared'

import type { AgentUIDataPart } from '@/types/agent'

export function createAgentDataHandler(
  onBuild: (prompt: BuildPrompt) => Promise<void>,
) {
  return (part: AgentUIDataPart): void => {
    switch (part.type) {
      case 'data-build':
        void onBuild(part.data)
        return
      case 'data-permission':
      case 'data-file-changed':
      case 'data-keep-alive':
        return
    }
    const unhandled: never = part
    return unhandled
  }
}
