import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { toast } from 'sonner'

import axiosInstance from '@/lib/axios'
import type { CadKernel, Project } from '@/types/project'

// ─── API payload types ────────────────────────────────────────────────────────

interface CreateProjectPayload {
  name: string
  cad_kernel: CadKernel
  directory: string
  action: 'create' | 'open'
}

interface UpdateProjectPayload {
  name?: string
  file?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROJECTS_KEY = ['projects'] as const

function extractErrorMessage(error: unknown, fallback: string): string {
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

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateProjectPayload) =>
      axiosInstance.post<Project>('/projects', payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY })
      toast.success('Project created successfully')
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to create project'))
    },
  })
}

export function useRenameProject() {
  const queryClient = useQueryClient()
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY })
      toast.success('Project renamed')
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to rename project'))
    },
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      axiosInstance.delete(`/projects/${id}`).then(() => undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY })
      toast.success('Project deleted')
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to delete project'))
    },
  })
}

export type { CreateProjectPayload, UpdateProjectPayload }
