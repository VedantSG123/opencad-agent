/* eslint-disable @typescript-eslint/no-explicit-any */

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } }

export function validateString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('INVALID_INPUT', `${name} must be a non-empty string`)
  }
  return value
}

export function validateObject(
  value: unknown,
  name: string,
): Record<string, any> {
  if (typeof value !== 'object' || value === null) {
    throw new AppError('INVALID_INPUT', `${name} must be an object`)
  }
  return value as Record<string, any>
}

export function createHandler<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult> | TResult,
) {
  return async (
    _event: Electron.IpcMainInvokeEvent,
    ...args: TArgs
  ): Promise<Result<TResult>> => {
    try {
      const data = await fn(...args)
      return { success: true, data }
    } catch (error: unknown) {
      console.error('IPC Handler error:', error)

      let code = 'INTERNAL_ERROR'
      let message: string

      if (error instanceof AppError) {
        code = error.code
        message = error.message
      } else if (error instanceof Error) {
        const sysError = error as Error & { code?: string }
        if (sysError.code === 'ENOENT') {
          code = 'FILE_NOT_FOUND'
          message = 'The specified file or directory was not found'
        } else if (sysError.code === 'EACCES' || sysError.code === 'EPERM') {
          code = 'PERMISSION_DENIED'
          message = 'Permission denied accessing the specified path'
        } else if (error.message.startsWith('Access Denied')) {
          code = 'ACCESS_DENIED'
          message = error.message
        } else {
          code = 'FS_ERROR'
          message = error.message
        }
      } else {
        message = String(error)
      }

      return {
        success: false,
        error: { code, message },
      }
    }
  }
}
