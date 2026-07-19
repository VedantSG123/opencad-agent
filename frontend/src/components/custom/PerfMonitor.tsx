import {
  Activity03Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
} from '@hugeicons/core-free-icons'
import { useEffect, useRef, useState } from 'react'
import Stats from 'stats.js'

import { Icon } from '@/components/icons/HugeIcon'

export default function PerfMonitor() {
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('opencad_perf_monitor_open')
    return saved === null ? true : saved === 'true'
  })

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem('opencad_perf_monitor_open', String(isOpen))
  }, [isOpen])

  useEffect(() => {
    if (!window.electron || !isOpen) return

    // 1. Create 4 independent stats.js Panel instances (they are canvas elements under the hood)
    const mainCpu = new Stats.Panel('M-CPU %', '#ff8800', '#221100')
    const mainMem = new Stats.Panel('M-RAM MB', '#00ff88', '#002211')
    const rendCpu = new Stats.Panel('R-CPU %', '#0088ff', '#001122')
    const rendMem = new Stats.Panel('R-RAM MB', '#ff0088', '#220011')

    // 2. Append the individual panel canvas DOMs side-by-side
    const currentContainer = containerRef.current
    if (currentContainer) {
      currentContainer.appendChild(mainCpu.dom)
      currentContainer.appendChild(mainMem.dom)
      currentContainer.appendChild(rendCpu.dom)
      currentContainer.appendChild(rendMem.dom)
    }

    // 3. Subscribe to the Electron Main Process telemetry updates
    const unsubscribe = window.electron.onMetrics((data) => {
      if (data.mainMetrics) {
        mainCpu.update(data.mainMetrics.cpu, 100)
        mainMem.update(data.mainMetrics.mem, 1024) // 1GB scale
      }
      if (data.rendererMetrics) {
        rendCpu.update(data.rendererMetrics.cpu, 100)
        rendMem.update(data.rendererMetrics.mem, 1024) // 1GB scale
      }
    })

    // 4. Clean up on component unmount or collapse
    return () => {
      unsubscribe()
      if (currentContainer) {
        currentContainer.innerHTML = ''
      }
    }
  }, [isOpen])

  if (!window.electron) return null

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className='fixed bottom-4 left-4 z-[99999] h-9 px-3 flex items-center gap-2 rounded-full bg-neutral-950/85 hover:bg-neutral-900/95 border border-neutral-800 text-neutral-300 cursor-pointer shadow-xl backdrop-blur-md transition-all duration-200'
        title='Show system performance telemetry'
      >
        <div className='relative flex h-2 w-2'>
          <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75'></span>
          <span className='relative inline-flex rounded-full h-2 w-2 bg-emerald-500'></span>
        </div>
        <Icon
          icon={Activity03Icon}
          size={16}
          className='text-emerald-400 animate-pulse'
        />
        <span className='text-[10px] font-semibold tracking-wider text-neutral-400 font-mono'>
          TELEMETRY
        </span>
        <Icon icon={ArrowUp01Icon} size={14} className='text-neutral-500' />
      </button>
    )
  }

  return (
    <div className='fixed bottom-4 left-4 z-[99999] bg-neutral-950/85 backdrop-blur-md border border-neutral-800/80 rounded-xl p-2.5 text-neutral-200 shadow-2xl transition-all duration-300 ease-in-out flex flex-col gap-2 pointer-events-auto'>
      {/* Header */}
      <div className='flex items-center justify-between border-b border-neutral-800/60 pb-1.5 px-0.5'>
        <div className='flex items-center gap-1.5'>
          <Icon icon={Activity03Icon} size={14} className='text-emerald-400' />
          <span className='font-mono text-[10px] font-semibold tracking-wider text-neutral-400'>
            SYSTEM TELEMETRY
          </span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className='text-neutral-400 hover:text-neutral-200 cursor-pointer p-0.5 rounded hover:bg-neutral-800/50 transition-colors'
          title='Minimize overlay'
        >
          <Icon icon={ArrowDown01Icon} size={16} />
        </button>
      </div>

      {/* Panels container (stat.js canvases will be injected side-by-side here) */}
      <div ref={containerRef} className='flex items-center gap-1.5' />
    </div>
  )
}
