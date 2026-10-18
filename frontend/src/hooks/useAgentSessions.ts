import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PermissionScope } from 'shared'

import axiosInstance from '@/lib/axios'
import type { AgentSession, AgentSessionDetail } from '@/types/agent'

const sessionsKey = (projectId: string) => ['sessions', projectId] as const
const sessionKey = (sessionId: string) => ['session', sessionId] as const

export function useAgentSessions(projectId: string) {
  return useQuery({
    queryKey: sessionsKey(projectId),
    queryFn: () =>
      axiosInstance
        .get<AgentSession[]>('/sessions', { params: { projectId } })
        .then((r) => r.data),
  })
}

/**
 * Never served from cache: the conversation is rebuilt from it when a chat
 * opens, and a stale copy would replay a turn the stream is already showing.
 */
export function useAgentSession(sessionId: string) {
  return useQuery({
    queryKey: sessionKey(sessionId),
    queryFn: () => fetchAgentSession(sessionId),
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

export function fetchAgentSession(
  sessionId: string,
): Promise<AgentSessionDetail> {
  return axiosInstance
    .get<AgentSessionDetail>(`/sessions/${sessionId}`)
    .then((r) => r.data)
}

export function useCreateAgentSession(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (title: string) =>
      axiosInstance
        .post<AgentSession>('/sessions', { projectId, title })
        .then((r) => r.data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: sessionsKey(projectId) }),
  })
}

export function useDeleteAgentSession(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      axiosInstance.delete(`/sessions/${sessionId}`).then(() => undefined),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: sessionsKey(projectId) }),
  })
}

/** After a turn, so the list's newest-first order and times catch up. */
export function useInvalidateAgentSessions(projectId: string) {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({ queryKey: sessionsKey(projectId) })
}

export function useAnswerPermission(sessionId: string) {
  return useMutation({
    mutationFn: ({
      toolCallId,
      scope,
    }: {
      toolCallId: string
      scope: PermissionScope | null
    }) =>
      axiosInstance
        .post(
          `/sessions/${sessionId}/permissions/${toolCallId}`,
          scope ? { scope } : { deny: true },
        )
        .then(() => undefined),
  })
}

export function useAbortAgentRun(sessionId: string) {
  return useMutation({
    mutationFn: () =>
      axiosInstance.post(`/sessions/${sessionId}/abort`).then(() => undefined),
  })
}
