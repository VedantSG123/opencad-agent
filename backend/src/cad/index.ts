import z from 'zod'

export const SUPPORTED_CAD_KERNELS = z.enum(['replicad', 'openscad'])

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
  openscad: {
    fileExtension: '.scad',
    description:
      'OpenSCAD is a free software for creating solid 3D CAD models. It uses a scripting language to define models procedurally.',
  },
}
