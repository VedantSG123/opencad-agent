import type { CadKernel } from '@/types/project'

export interface KernelInfo {
  label: string
  description: string
  image: string
  fileExtension: string
}

export const KERNEL_INFO: Record<CadKernel, KernelInfo> = {
  replicad: {
    label: 'Replicad',
    description: 'JavaScript-based parametric CAD with a fluent API',
    image: '/replicad.png',
    fileExtension: '.js',
  },
  openscad: {
    label: 'OpenSCAD',
    description: 'Scripting language for solid 3D CAD modelling',
    image: '/openscad.png',
    fileExtension: '.scad',
  },
  build123d: {
    label: 'build123d',
    description: 'Python CAD library built on OpenCascade',
    image: '/build123d.svg',
    fileExtension: '.py',
  },
}
