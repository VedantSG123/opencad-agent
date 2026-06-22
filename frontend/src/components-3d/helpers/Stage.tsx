import type { ThreeElements } from '@react-three/fiber'
import { useThree } from '@react-three/fiber'
import * as React from 'react'
import * as THREE from 'three'

export interface StageHandle {
  reset: () => void
}

export default React.forwardRef<StageHandle, StageProps>(function Stage(
  { children, center = false, ...props },
  ref,
) {
  const camera = useThree((state) => state.camera)
  const { invalidate } = useThree()
  const outer = React.useRef<THREE.Group>(null)
  const inner = React.useRef<THREE.Group>(null)
  const hasFramed = React.useRef(false)

  const lastRadius = React.useRef<number | null>(null)

  const frameCamera = React.useCallback(
    (forceReset = false) => {
      if (!outer.current || !inner.current || !camera) return

      outer.current.updateWorldMatrix(true, true)
      const box3 = new THREE.Box3().setFromObject(inner.current)
      if (box3.isEmpty()) return

      if (center) {
        const centerPoint = new THREE.Vector3()
        box3.getCenter(centerPoint)
        outer.current.position.set(
          outer.current.position.x - centerPoint.x,
          outer.current.position.y - centerPoint.y,
          outer.current.position.z - centerPoint.z,
        )
        outer.current.updateWorldMatrix(true, true)
        box3.setFromObject(inner.current)
      }

      const sphere = new THREE.Sphere()
      box3.getBoundingSphere(sphere)

      const newRadius = sphere.radius
      const newTop = box3.max.z
      const previousRadius = lastRadius.current

      if (!forceReset && hasFramed.current) {
        if (previousRadius && previousRadius !== newRadius) {
          const ratio = newRadius / previousRadius
          camera.position.set(
            camera.position.x * ratio,
            camera.position.y * ratio,
            camera.position.z * ratio,
          )
          camera.far = Math.max(5000, newRadius * 4)
        }
      } else {
        camera.position.set(
          newRadius * 0.25,
          -newRadius * 1.5,
          Math.max(newTop, newRadius) * 1.5,
        )
        camera.near = 0.1
        camera.far = Math.max(5000, newRadius * 4)
        camera.lookAt(0, 0, 0)

        if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
          const orthoCam = camera as THREE.OrthographicCamera
          orthoCam.position.set(newRadius, -newRadius, newRadius)
          orthoCam.zoom = 5
          orthoCam.near = -Math.max(5000, newRadius * 4)
          orthoCam.updateProjectionMatrix()
        }
      }

      lastRadius.current = newRadius
      hasFramed.current = true
      invalidate()
    },
    [camera, center, invalidate],
  )

  React.useLayoutEffect(() => {
    if (!outer.current || !inner.current) return
    frameCamera()
  }, [frameCamera, children])

  React.useImperativeHandle(ref, () => ({
    reset: () => frameCamera(true),
  }))

  return (
    <group {...props}>
      <group ref={outer}>
        <group ref={inner}>{children}</group>
      </group>
    </group>
  )
})

type StageProps = ThreeElements['group'] & {
  center?: boolean
  children: React.ReactNode
}
