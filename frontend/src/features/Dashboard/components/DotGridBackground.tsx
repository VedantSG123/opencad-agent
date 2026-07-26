import { useEffect, useRef } from 'react'

const FADE_DELAY_MS = 300

export function DotGridBackground() {
  const containerRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const highlight = highlightRef.current
    if (!container || !highlight) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    let fadeTimeout: ReturnType<typeof setTimeout> | undefined

    function handleMouseMove(event: MouseEvent) {
      const rect = container!.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top

      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        highlight!.style.opacity = '0'
        return
      }

      highlight!.style.setProperty('--dot-mx', `${x}px`)
      highlight!.style.setProperty('--dot-my', `${y}px`)
      highlight!.style.opacity = '1'

      clearTimeout(fadeTimeout)
      fadeTimeout = setTimeout(() => {
        highlight!.style.opacity = '0'
      }, FADE_DELAY_MS)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      clearTimeout(fadeTimeout)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className='absolute inset-0 overflow-hidden pointer-events-none'
      aria-hidden='true'
    >
      <div className='dot-grid-layer dot-grid-base' />
      <div ref={highlightRef} className='dot-grid-layer dot-grid-highlight' />
    </div>
  )
}
