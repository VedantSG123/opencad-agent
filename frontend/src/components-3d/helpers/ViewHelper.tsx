import { useFrame, useThree } from '@react-three/fiber'
import * as React from 'react'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import type { GizmoPlacement } from './ViewGizmo'
import { ViewGizmo } from './ViewGizmo'

type ViewHelperProps = {
  placement?: GizmoPlacement
  size?: number
}

/**
 * Mounts the navigation gizmo.
 *
 * Everything it does lives in `ViewGizmo`; this is the lifecycle around it. The
 * positive frame priority hands the render loop over, which is what lets the
 * gizmo draw into a corner of the frame after the scene rather than into one of
 * its own.
 */
export function ViewHelper({ placement, size }: ViewHelperProps) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const controls = useThree((state) => state.controls) as OrbitControls | null

  // The canvas sits in a positioned wrapper R3F creates, which is where the
  // gizmo's own hit area belongs - a sibling of the canvas, so a pointer on it
  // never reaches the scene and cannot select a face or start an orbit.
  const gizmo = React.useMemo(() => {
    const container = gl.domElement.parentElement
    if (!container) {
      return null
    }

    return new ViewGizmo({
      camera,
      renderer: gl as unknown as ConstructorParameters<
        typeof ViewGizmo
      >[0]['renderer'],
      container,
      placement,
      size,
      onChange: invalidate,
    })
  }, [gl, camera, placement, size, invalidate])

  React.useEffect(() => {
    return () => gizmo?.dispose()
  }, [gizmo])

  React.useEffect(() => {
    gizmo?.setControls(controls)
    return () => gizmo?.setControls(null)
  }, [gizmo, controls])

  useFrame((_, delta) => {
    if (gizmo?.update(delta)) {
      invalidate()
    }

    gl.render(scene, camera)
    gizmo?.render()
  }, 1)

  return null
}
