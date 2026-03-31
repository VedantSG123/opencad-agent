export type CadKernel = 'replicad' | 'openscad'

export interface Project {
  id: string
  name: string
  cad_kernel: CadKernel
  directory: string
  file: string
  time: {
    created: string
    updated: string
  }
}
