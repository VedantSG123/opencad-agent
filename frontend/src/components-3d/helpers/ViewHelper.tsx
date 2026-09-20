import { useFrame, useThree } from '@react-three/fiber'
import * as React from 'react'
import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { createViewGizmo, GIZMO_SIZE } from './viewGizmo'

/** Seconds the camera takes to swing to a clicked axis. */
const DURATION = 0.4

const ORIGIN = new THREE.Vector3()

type Swing = {
  from: THREE.Vector3
  to: THREE.Vector3
  center: THREE.Vector3
  radius: number
  elapsed: number
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

/**
 * The corner axis gizmo, and clicking it to align the view.
 *
 * Only the camera's position is animated; its orientation is left to
 * OrbitControls, which derives it from `camera.up` on every update. Animating
 * the orientation too would have the controls recompute it on their next update
 * and snap the roll the moment the user touched the mouse - and it is what
 * makes this work in a Z-up scene, where the addon's hardcoded Y-up targets do
 * not.
 */
export function ViewHelper() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const controls = useThree((state) => state.controls) as OrbitControls | null

  const gizmo = React.useMemo(() => createViewGizmo(), [])
  const swing = React.useRef<Swing | null>(null)

  React.useEffect(() => {
    return () => gizmo.dispose()
  }, [gizmo])

  // A DOM square over the corner rather than a listener on the canvas: events
  // that land here never reach R3F, so clicking an axis cannot also select the
  // face behind it or start an orbit.
  React.useEffect(() => {
    const container = gl.domElement.parentElement
    if (!container) {
      return
    }

    const target = document.createElement('div')
    target.style.cssText = `position:absolute;right:0;bottom:0;width:${GIZMO_SIZE}px;height:${GIZMO_SIZE}px;z-index:10`
    container.appendChild(target)

    const onPointerUp = (event: PointerEvent) => {
      const rect = target.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )

      const axis = gizmo.hitTest(ndc, camera)
      if (!axis) {
        return
      }

      const center = controls?.target ?? ORIGIN
      const from = camera.position.clone().sub(center)
      const radius = from.length()
      if (radius < 1e-6) {
        return
      }

      swing.current = {
        from: from.normalize(),
        to: axis.normalize(),
        center: center.clone(),
        radius,
        elapsed: 0,
      }
      invalidate()
    }

    target.addEventListener('pointerup', onPointerUp)
    return () => {
      target.removeEventListener('pointerup', onPointerUp)
      target.remove()
    }
  }, [gl, camera, controls, gizmo, invalidate])

  const rotation = React.useMemo(() => new THREE.Quaternion(), [])
  const step = React.useMemo(() => new THREE.Quaternion(), [])
  const direction = React.useMemo(() => new THREE.Vector3(), [])

  // A positive priority hands the render loop over, so this draws the scene
  // itself and then the gizmo over it.
  useFrame((_, delta) => {
    const active = swing.current
    if (active) {
      active.elapsed += delta
      const t = Math.min(1, active.elapsed / DURATION)

      // Turned along the sphere rather than lerped across it, which would pass
      // through the centre on a half turn.
      rotation.setFromUnitVectors(active.from, active.to)
      step.identity().slerp(rotation, smoothstep(t))
      direction.copy(active.from).applyQuaternion(step)

      camera.position
        .copy(active.center)
        .addScaledVector(direction, active.radius)

      // Controls ran before this at a lower priority, so the orientation it
      // computed is for where the camera was, not where it now is.
      controls?.update()

      if (t >= 1) {
        swing.current = null
      }
      invalidate()
    }

    gl.render(scene, camera)

    // The gizmo draws into a corner of the same frame, so the colour buffer
    // has to survive its render.
    const autoClear = gl.autoClear
    gl.autoClear = false
    gizmo.render(gl, camera)
    gl.autoClear = autoClear
  }, 1)

  return null
}
