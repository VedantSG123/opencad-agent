import { button, Leva, levaStore, useControls } from 'leva'
import * as React from 'react'

interface ParametersPanelProps {
  defaultParams: Record<string, unknown>
  onApply: (params: Record<string, unknown>) => void
}

export function ParametersPanel({
  defaultParams,
  onApply,
}: ParametersPanelProps) {
  const paramsConfig = React.useMemo(() => {
    return {
      _run: button((get) => {
        const currentValues = Object.fromEntries(
          levaStore
            .getVisiblePaths()
            .filter((f) => f !== '_run')
            .map((f) => [f, get(f)]),
        )
        onApply(currentValues)
      }),
      ...defaultParams,
    }
  }, [defaultParams, onApply])

  useControls(() => paramsConfig, [defaultParams])

  React.useEffect(() => {
    return () => {
      levaStore.dispose()
    }
  }, [])

  return (
    <div className='w-72 bg-zinc-900/90 text-zinc-200 border border-zinc-700/50 rounded-lg shadow-xl overflow-hidden font-sans select-none flex flex-col max-h-[400px]'>
      <div className='flex items-center justify-between px-3 py-2 bg-zinc-800/80 border-b border-zinc-700/50 shrink-0 h-9'>
        <span className='text-xs font-semibold uppercase tracking-wider text-zinc-400'>
          Model Parameters
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
