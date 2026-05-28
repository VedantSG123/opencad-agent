import { button, LevaPanel, useControls, useCreateStore } from 'leva'
import * as React from 'react'

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
        theme={{
          colors: {
            elevation1: '#18181b', // dark zinc-900 card bg
            elevation2: '#1f1f23', // dark charcoal input background
            elevation3: '#27272a', // dark border highlight
            highlight1: '#3b82f6', // blue-500 accent
            highlight2: '#2563eb', // blue-600 active
            highlight3: '#1d4ed8', // blue-700
            accent1: '#3b82f6',
            accent2: '#60a5fa',
            accent3: '#1d4ed8',
            vivid1: '#ef4444',
            folderWidgetColor: '#3f3f46',
            folderTextColor: '#a1a1aa',
            toolTipBackground: '#27272a',
            toolTipText: '#f4f4f5',
          },
          sizes: {
            rootWidth: '288px',
            controlWidth: '130px',
          },
        }}
      />
    </div>
  )
}
