import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Converts an absolute host path (from the DB) to a virtual filesystem-relative
 * path used by the mounted ZenFS backend (e.g. "/home/user/Test/main.scad" -> "/main.scad").
 */
export function toFsPath(
  projectDir: string,
  absolutePath: string,
): string | null {
  if (!absolutePath.startsWith(projectDir)) return null
  const rel = absolutePath.slice(projectDir.length)
  return rel.startsWith('/') ? rel : `/${rel}`
}
