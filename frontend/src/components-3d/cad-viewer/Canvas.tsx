import type { CanvasProps } from '@react-three/fiber'
import { Canvas as R3FCanvas } from '@react-three/fiber'
import { Perf } from 'r3f-webgpu-perf'
import * as React from 'react'
import { WebGPURenderer } from 'three/webgpu'

const SHOW_PERF = localStorage.getItem('opencad_webgl_perf') === 'true'

async function createRenderer(props: {
  canvas: HTMLCanvasElement
  antialias?: boolean
  alpha?: boolean
}) {
  const renderer = new WebGPURenderer({
    canvas: props.canvas,
    antialias: props.antialias,
    alpha: props.alpha,
    powerPreference: 'high-performance',
  })
  await renderer.init()
  return renderer
}

export const Canvas: React.FC<CanvasProps> = ({ children, ...rest }) => {
  return (
    <React.Suspense fallback={null}>
      <R3FCanvas
        dpr={Math.min(2, window.devicePixelRatio)}
        frameloop={'always'}
        gl={createRenderer as CanvasProps['gl']}
        {...rest}
      >
        {SHOW_PERF && <Perf position='top-right' />}
        {children}
      </R3FCanvas>
    </React.Suspense>
  )
}
