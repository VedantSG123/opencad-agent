import axios from 'axios'

import type {
  CreateProjectPayload,
  Project,
  UpdateProjectPayload,
} from '@/types/project'

import { getBaseApiUrl } from '../utils/getApiBaseUrl'

const api = axios.create({
  baseURL: getBaseApiUrl(),
})

export const projectsApi = {
  getAll: (): Promise<Project[]> =>
    api.get<Project[]>('/projects').then((r) => r.data),

  getById: (id: string): Promise<Project> =>
    api.get<Project>(`/projects/${id}`).then((r) => r.data),

  create: (payload: CreateProjectPayload): Promise<Project> =>
    api.post<Project>('/projects', payload).then((r) => r.data),

  update: (id: string, payload: UpdateProjectPayload): Promise<Project> =>
    api.patch<Project>(`/projects/${id}`, payload).then((r) => r.data),

  delete: (id: string): Promise<void> =>
    api.delete(`/projects/${id}`).then(() => undefined),
}
