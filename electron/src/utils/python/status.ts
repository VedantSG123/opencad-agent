import { existsSync } from 'node:fs'

import type { PythonEnvStatus } from 'shared/python'
import { PYTHON_REQUIREMENTS } from 'shared/python'

import { getSettings } from '../settings.js'
import { MANAGED_INTERPRETER } from './paths.js'
import { probeInterpreter } from './probe.js'

// Probing costs an OCCT import, so the answer is held until something that
// could change it happens - an install, a repair, a new interpreter.
let cached: PythonEnvStatus | null = null

export function invalidatePythonStatus() {
  cached = null
}

export async function getPythonStatus(): Promise<PythonEnvStatus> {
  if (cached) {
    return cached
  }

  const custom = getSettings().python.interpreter
  const source = custom ? 'custom' : 'managed'
  const interpreter = custom ?? MANAGED_INTERPRETER

  if (!existsSync(interpreter)) {
    // A missing managed environment is the state every new install starts in;
    // a missing interpreter the user chose themselves is something being wrong.
    if (!custom) {
      return { state: 'not-installed' }
    }
    cached = {
      state: 'broken',
      source,
      interpreter,
      reason: `No interpreter at ${interpreter}`,
    }
    return cached
  }

  const probe = await probeInterpreter(interpreter)
  if (!probe.ok) {
    cached = { state: 'broken', source, interpreter, reason: probe.reason }
    return cached
  }

  const drifted = Object.entries(PYTHON_REQUIREMENTS).some(
    ([name, pinned]) => probe.packages[name] !== pinned,
  )

  cached = drifted
    ? {
        state: 'outdated',
        source,
        interpreter,
        pythonVersion: probe.pythonVersion,
        packages: probe.packages,
        expected: PYTHON_REQUIREMENTS,
      }
    : {
        state: 'ready',
        source,
        interpreter,
        pythonVersion: probe.pythonVersion,
        packages: probe.packages,
      }

  return cached
}
