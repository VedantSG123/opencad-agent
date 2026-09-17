import * as React from 'react'
import type { PythonEnvStatus, PythonInstallStep } from 'shared/python'

import type { Result } from '@/types/electron'

/** How many uv output lines the setup panel keeps on screen. */
const LOG_LIMIT = 200

type PythonEnvState = {
  status: PythonEnvStatus | null
  log: string[]
  step: { step: PythonInstallStep; index: number; total: number } | null
  isBusy: boolean
  error: string | null
}

type PythonEnvActions = {
  install: () => Promise<void>
  repair: () => Promise<void>
  cancel: () => Promise<void>
  chooseInterpreter: (interpreter: string | null) => Promise<void>
  refresh: () => Promise<void>
}

const INITIAL: PythonEnvState = {
  status: null,
  log: [],
  step: null,
  isBusy: false,
  error: null,
}

/**
 * The managed Python environment, as the main process reports it.
 *
 * Not React Query: the status is owned by the main process and pushed here on
 * its own schedule, so the cache would only ever be one step behind the
 * progress events that arrive alongside it.
 */
export function usePythonEnv(): PythonEnvState & PythonEnvActions {
  const [state, setState] = React.useState<PythonEnvState>(INITIAL)

  const refresh = React.useCallback(async () => {
    const result = await window.electron?.getPythonStatus()
    if (!result) {
      return
    }
    setState((prev) =>
      result.success
        ? { ...prev, status: result.data, error: null }
        : { ...prev, error: result.error.message },
    )
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  // Subscribed before any install starts, so a setup already running when this
  // mounts still reports into the panel.
  React.useEffect(() => {
    return window.electron?.onPythonProgress((progress) => {
      setState((prev) => {
        if (progress.type === 'log') {
          return {
            ...prev,
            log: [...prev.log, progress.line].slice(-LOG_LIMIT),
          }
        }
        if (progress.type === 'step') {
          return {
            ...prev,
            step: {
              step: progress.step,
              index: progress.index,
              total: progress.total,
            },
          }
        }
        return { ...prev, status: progress.status, step: null, isBusy: false }
      })
    })
  }, [])

  const run = React.useCallback(
    async (start: () => Promise<Result<PythonEnvStatus> | undefined>) => {
      setState((prev) => ({
        ...prev,
        isBusy: true,
        error: null,
        log: [],
        step: null,
      }))
      const result = await start()
      // A refused call never reaches the progress stream, so nothing else
      // would clear isBusy.
      if (result && !result.success) {
        setState((prev) => ({
          ...prev,
          isBusy: false,
          error: result.error.message,
        }))
      }
    },
    [],
  )

  const install = React.useCallback(
    () => run(() => window.electron!.installPython()),
    [run],
  )

  const repair = React.useCallback(
    () => run(() => window.electron!.repairPython()),
    [run],
  )

  const cancel = React.useCallback(async () => {
    await window.electron?.cancelPythonInstall()
  }, [])

  const chooseInterpreter = React.useCallback(
    async (interpreter: string | null) => {
      setState((prev) => ({ ...prev, isBusy: true, error: null }))
      const result = await window.electron?.setPythonInterpreter(interpreter)
      setState((prev) =>
        result?.success
          ? { ...prev, status: result.data, isBusy: false, error: null }
          : {
              ...prev,
              isBusy: false,
              error: result ? result.error.message : null,
            },
      )
    },
    [],
  )

  return { ...state, install, repair, cancel, chooseInterpreter, refresh }
}

export const PYTHON_STEP_LABELS: Record<PythonInstallStep, string> = {
  interpreter: 'Downloading Python',
  environment: 'Creating the environment',
  packages: 'Installing build123d',
  validate: 'Checking the environment',
}
