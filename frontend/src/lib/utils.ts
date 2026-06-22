import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const isWindows =
  typeof navigator !== 'undefined' &&
  /win/i.test(navigator.platform || navigator.userAgent || '')

/**
 * Normalizes all slashes to match the OS (backslashes on Windows, forward slashes on Unix).
 */
export function normalizePath(p: string): string {
  if (!p) return ''
  const separator = isWindows ? '\\' : '/'
  return p.replace(/[/\\]/g, separator)
}

/**
 * Joins a directory and a name, normalizing slashes and preventing nested folders
 * if the directory already ends with the name.
 */
export function joinPaths(dir: string, name: string): string {
  const separator = isWindows ? '\\' : '/'
  const cleanedDir = dir.trim().replace(/[/\\]+$/, '')
  const cleanedName = name
    .trim()
    .replace(/^[/\\]+/, '')
    .replace(/[/\\]+$/, '')

  const normDir = cleanedDir.replace(/\\/g, '/')
  const normName = cleanedName.replace(/\\/g, '/')

  if (normDir.toLowerCase().endsWith('/' + normName.toLowerCase())) {
    return cleanedDir
  }

  return `${cleanedDir}${separator}${cleanedName}`
}

/**
 * Converts an absolute host path (from the DB) to a virtual filesystem-relative
 * path used by the mounted ZenFS backend (e.g. "/home/user/Test/main.scad" -> "/main.scad").
 */
export function toFsPath(
  projectDir: string,
  absolutePath: string,
): string | null {
  const normDir = normalizePath(projectDir)
  const normPath = normalizePath(absolutePath)
  if (!normPath.startsWith(normDir)) return null
  const rel = normPath.slice(normDir.length)
  const cleanRel = rel.replace(/\\/g, '/')
  return cleanRel.startsWith('/') ? cleanRel : `/${cleanRel}`
}
