import { button, folder, LevaPanel, useControls, useCreateStore } from 'leva'
import * as React from 'react'

import type { Parameter, ParameterSet } from './openscad/customizer-types'

interface OpenSCADParametersPanelProps {
  parameterSet: ParameterSet
  vars: Record<string, unknown>
  onApply: (params: Record<string, unknown>) => void
}

function mapParamToLevaConfig(param: Parameter, currentValue: unknown) {
  const value = currentValue !== undefined ? currentValue : param.initial
  const label = param.caption ?? param.name

  // 1. Checkbox for boolean
  if (param.type === 'boolean') {
    return {
      value,
      label,
    }
  }

  // 2. Select dropdown for options
  if ('options' in param && param.options && param.options.length > 0) {
    const optionsObj = Object.fromEntries(
      param.options.map((opt) => [opt.name, opt.value]),
    )
    return {
      value,
      options: optionsObj,
      label,
    }
  }

  // 3. Vector handling
  if (Array.isArray(value)) {
    return {
      value: [...(value as unknown[])],
      step: 'step' in param ? param.step : undefined,
      label,
    }
  }

  // 4. Slider or Number control
  if (param.type === 'number') {
    return {
      value,
      min: 'min' in param ? param.min : undefined,
      max: 'max' in param ? param.max : undefined,
      step: 'step' in param ? param.step : undefined,
      label,
    }
  }

  // 5. Text/String input
  return {
    value,
    label,
  }
}

function buildSchema(
  parameterSet: ParameterSet,
  vars: Record<string, unknown>,
  onApply: (params: Record<string, unknown>) => void,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: Record<string, any> = {}

  const groups: Record<string, Parameter[]> = {}
  const ungrouped: Parameter[] = []
  const groupOrder: string[] = []

  for (const param of parameterSet.parameters) {
    if (param.group) {
      if (!groups[param.group]) {
        groups[param.group] = []
        groupOrder.push(param.group)
      }
      groups[param.group].push(param)
    } else {
      ungrouped.push(param)
    }
  }

  // 1. Add ungrouped parameters
  for (const param of ungrouped) {
    config[param.name] = mapParamToLevaConfig(param, vars[param.name])
  }

  // 2. Add grouped parameters in folders
  for (const groupName of groupOrder) {
    const params = groups[groupName]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const folderSchema: Record<string, any> = {}
    for (const param of params) {
      folderSchema[param.name] = mapParamToLevaConfig(param, vars[param.name])
    }

    config[groupName] = folder(folderSchema, { collapsed: false })
  }

  // 3. Add Apply button at the end

  config.Apply = button((get) => {
    const currentValues: Record<string, unknown> = {}
    for (const param of parameterSet.parameters) {
      const path = param.group ? `${param.group}.${param.name}` : param.name
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const val = get(path)
      currentValues[param.name] = val as unknown
    }
    onApply(currentValues)
  })

  return config
}

export function OpenSCADParametersPanel({
  parameterSet,
  vars,
  onApply,
}: OpenSCADParametersPanelProps) {
  const store = useCreateStore()

  // Rebuild the schema when parameter definitions or values (vars) change
  const schema = React.useMemo(() => {
    return buildSchema(parameterSet, vars, onApply)
  }, [parameterSet, vars, onApply])

  // Register schema and initialize values in our local store
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
  const [_values] = useControls(() => schema as any, { store }, [schema])

  // Synchronize external changes of vars into Leva store (for presets, undo/redo, etc.)
  React.useEffect(() => {
    const levaValues: Record<string, unknown> = {}
    for (const param of parameterSet.parameters) {
      const value = vars[param.name]
      if (value !== undefined) {
        if (param.group) {
          levaValues[`${param.group}.${param.name}`] = value
        } else {
          levaValues[param.name] = value
        }
      }
    }
    store.set(levaValues, false)
  }, [vars, parameterSet, store])

  return (
    <div className='w-72 relative Leva-container'>
      <LevaPanel
        store={store}
        hideCopyButton
        titleBar={{
          title: 'OpenSCAD Parameters',
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
