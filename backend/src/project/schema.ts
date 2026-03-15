import z from 'zod'

import { SUPPORTED_CAD_KERNELS } from '../cad'

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  cad_kernel: SUPPORTED_CAD_KERNELS,
  directory: z.string(),
  file: z.string(),
  time: z.object({
    created: z.string(),
    updated: z.string(),
  }),
})

export type Project = z.infer<typeof ProjectSchema>
