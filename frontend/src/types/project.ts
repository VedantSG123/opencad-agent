export type CadKernel = 'replicad' | 'openscad'

export interface Project {
  id: string
  name: string
  cad_kernel: CadKernel
  directory: string
  file: string | null
  time: {
    created: string
    updated: string
  }
}

export interface CreateProjectPayload {
  name: string
  cad_kernel: CadKernel
  directory: string
  action: 'create' | 'open'
}

export interface UpdateProjectPayload {
  name?: string
  file?: string | null
}
