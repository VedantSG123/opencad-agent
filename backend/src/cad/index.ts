import z from 'zod'

export const SUPPORTED_CAD_KERNELS = z.enum(['replicad'])

export type SupportedCADKernels = z.infer<typeof SUPPORTED_CAD_KERNELS>

type KernelInfo = {
  fileExtension: string
  description: string
}

export const CADKernels: Record<SupportedCADKernels, KernelInfo> = {
  replicad: {
    fileExtension: '.js',
    description:
      'Replicad is a CAD kernel that uses JavaScript for scripting. It allows users to create and manipulate 3D models using a simple and intuitive API.',
  },
}
