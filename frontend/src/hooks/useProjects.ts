import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

import axiosInstance from '@/lib/axios'
import type {
  CreateProjectPayload,
  Project,
  UpdateProjectPayload,
} from '@/types/project'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROJECTS_KEY = ['projects'] as const

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const msg = (error.response?.data?.message as string) || ''
    return msg ? msg : error.message || fallback
  }
  if (error instanceof Error) return error.message
  return fallback
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useProjects() {
  return useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: () =>
      axiosInstance.get<Project[]>('/projects').then((r) => r.data),
  })
}

export function useInvalidateProjects() {
  const queryClient = useQueryClient()
  return {
    invalidateProjects: async () => {
      await queryClient.invalidateQueries({
        queryKey: PROJECTS_KEY,
      })
    },
  }
}

export function useCreateProject() {
  return useMutation({
    mutationFn: (payload: CreateProjectPayload) =>
      axiosInstance.post<Project>('/projects', payload).then((r) => r.data),
  })
}

export function useRenameProject() {
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string
      payload: UpdateProjectPayload
    }) =>
      axiosInstance
        .patch<Project>(`/projects/${id}`, payload)
        .then((r) => r.data),
  })
}

export function useSetProjectFile() {
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: string }) =>
      axiosInstance
        .patch<Project>(`/projects/${id}`, { file })
        .then((r) => r.data),
  })
}

export function useDeleteProject() {
  return useMutation({
    mutationFn: (id: string) =>
      axiosInstance.delete(`/projects/${id}`).then(() => undefined),
  })
}
