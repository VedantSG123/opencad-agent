import { button, LevaPanel, useControls, useCreateStore } from 'leva'
import * as React from 'react'

import { useLevaTheme } from './useLevaTheme'

interface ReplicadParametersPanelProps {
  defaultParams: Record<string, unknown>
  vars: Record<string, unknown>
  onApply: (params: Record<string, unknown>) => void
}

export function ReplicadParametersPanel({
  defaultParams,
  vars,
  onApply,
}: ReplicadParametersPanelProps) {
  const store = useCreateStore()
  const levaTheme = useLevaTheme()

  const paramsConfig = React.useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: Record<string, any> = {
      ...defaultParams,
    }

    // Add Apply button at the end
    config.Apply = button((get) => {
      const currentValues: Record<string, unknown> = {}
      for (const key of Object.keys(defaultParams)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const val = get(key)
        currentValues[key] = val as unknown
      }
      onApply(currentValues)
    })

    return config
  }, [defaultParams, onApply])

  // Register schema and initialize values in our local store
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
  const [_values] = useControls(() => paramsConfig as any, { store }, [
    paramsConfig,
  ])

  // Synchronize external changes of vars into Leva store (for presets, undo/redo, etc.)
  React.useEffect(() => {
    const levaValues: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(vars)) {
      if (value !== undefined) {
        levaValues[key] = value
      }
    }
    store.set(levaValues, false)
  }, [vars, store])

  return (
    <div className='w-72 relative Leva-container'>
      <LevaPanel
        store={store}
        hideCopyButton
        titleBar={{
          title: 'Model Parameters',
          drag: false,
          filter: false,
        }}
        theme={levaTheme}
      />
    </div>
  )
}
