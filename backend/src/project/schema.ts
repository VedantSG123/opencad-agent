import { projectPreferencesSchema } from 'shared'
import z from 'zod'

import { SUPPORTED_CAD_KERNELS } from '../cad'

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  cad_kernel: SUPPORTED_CAD_KERNELS,
  directory: z.string(),
  file: z.string().nullable(),
  preferences: projectPreferencesSchema,
  time: z.object({
    created: z.string(),
    updated: z.string(),
    accessed: z.string().nullable(),
  }),
})

export type Project = z.infer<typeof ProjectSchema>
