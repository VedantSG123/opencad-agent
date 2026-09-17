import type { PythonEnvStatus } from 'shared/python'

import { AppError } from '../ipc-utils.js'
import { updateSettings } from '../settings.js'
import { probeInterpreter } from './probe.js'
import { getPythonStatus, invalidatePythonStatus } from './status.js'

/**
 * Point the app at an interpreter the user manages themselves, or back at the
 * managed environment with `null`.
 *
 * Probed before it is stored: a path that cannot import build123d would
 * otherwise be accepted here and only fail later, at the first run.
 */
export async function setCustomInterpreter(
  interpreter: string | null,
): Promise<PythonEnvStatus> {
  if (interpreter) {
    const probe = await probeInterpreter(interpreter)
    if (!probe.ok) {
      throw new AppError(
        'PYTHON_INTERPRETER_UNUSABLE',
        `${interpreter} cannot run build123d: ${probe.reason}`,
      )
    }
  }

  updateSettings({ python: { interpreter } })
  invalidatePythonStatus()
  return getPythonStatus()
}
