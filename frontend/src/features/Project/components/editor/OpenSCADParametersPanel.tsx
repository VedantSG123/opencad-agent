import { button, folder, Leva, levaStore, useControls } from 'leva'
import * as React from 'react'

import type { Parameter, ParameterSet } from './openscad/customizer-types'

interface OpenSCADParametersPanelProps {
  parameterSet: ParameterSet
  vars: Record<string, unknown>
  onApply: (params: Record<string, unknown>) => void
}

function mapParamToLevaConfig(param: Parameter, currentValue: unknown) {
  const value = currentValue !== undefined ? currentValue : param.initial

  // 1. Checkbox for boolean
  if (param.type === 'boolean') {
    return {
      value,
      label: param.caption || param.name,
    }
  }

  // 2. Select dropdown for options
  if ('options' in param && param.options && param.options.length > 0) {
    const optionsObj: Record<string, unknown> = {}
    for (const opt of param.options) {
      optionsObj[opt.name] = opt.value
    }
    return {
      value,
      options: optionsObj,
      label: param.caption || param.name,
    }
  }

  // 3. Slider or Number control
  if (param.type === 'number') {
    if (Array.isArray(param.initial)) {
      return {
        value,
        label: param.caption || param.name,
      }
    } else {
      return {
        value,
        min: 'min' in param ? param.min : undefined,
        max: 'max' in param ? param.max : undefined,
        step: 'step' in param ? param.step : undefined,
        label: param.caption || param.name,
      }
    }
  }

  // 4. Text/String input
  return {
    value,
    label: param.caption || param.name,
  }
}

export function OpenSCADParametersPanel({
  parameterSet,
  vars,
  onApply,
}: OpenSCADParametersPanelProps) {
  const paramsConfig = React.useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: Record<string, any> = {
      _run: button((get) => {
        const currentValues: Record<string, unknown> = {}
        for (const param of parameterSet.parameters) {
          const path = param.group ? `${param.group}.${param.name}` : param.name
          currentValues[param.name] = get(path) as unknown
        }
        onApply(currentValues)
      }),
    }

    const groups: Record<string, Parameter[]> = {}
    const ungrouped: Parameter[] = []

    for (const param of parameterSet.parameters) {
      if (param.group) {
        if (!groups[param.group]) {
          groups[param.group] = []
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
    for (const [groupName, params] of Object.entries(groups)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const folderSchema: Record<string, any> = {}
      for (const param of params) {
        folderSchema[param.name] = mapParamToLevaConfig(param, vars[param.name])
      }
      config[groupName] = folder(folderSchema)
    }

    return config
  }, [parameterSet, vars, onApply])

  useControls(() => paramsConfig, [paramsConfig])

  React.useEffect(() => {
    return () => {
      levaStore.dispose()
    }
  }, [])

  return (
    <div className='w-72 bg-zinc-900/90 text-zinc-200 border border-zinc-700/50 rounded-lg shadow-xl overflow-hidden font-sans select-none flex flex-col max-h-[400px]'>
      <div className='flex items-center justify-between px-3 py-2 bg-zinc-800/80 border-b border-zinc-700/50 shrink-0 h-9'>
        <span className='text-xs font-semibold uppercase tracking-wider text-zinc-400'>
          OpenSCAD Parameters
        </span>
      </div>
      <div className='flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent Leva-container'>
        <Leva
          fill
          flat
          hideCopyButton
          titleBar={false}
          theme={{
            colors: {
              elevation1: 'transparent',
              elevation2: '#1f1f23', // dark charcoal
              elevation3: '#18181b', // dark border / title
              highlight1: '#3b82f6', // blue-500
              highlight2: '#2563eb', // blue-600
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
              controlWidth: '130px',
            },
          }}
        />
      </div>
    </div>
  )
}
