import { useThree } from '@react-three/fiber'
import * as React from 'react'
import * as THREE from 'three'

type AxesProps = {
  /** Arm length in world units. */
  size: number
}

/**
 * X/Y/Z arms at the world origin, the way ocp-cad-viewer marks it.
 *
 * `AxesHelper` is one `LineSegments` with vertex colours, so the whole thing is
 * a single draw call.
 */
export function Axes({ size }: AxesProps) {
  const invalidate = useThree((state) => state.invalidate)

  const helper = React.useMemo(() => {
    const axes = new THREE.AxesHelper(size)
    // Drawn on top of the grid it sits in, which shares the z = 0 plane.
    axes.renderOrder = 1
    return axes
  }, [size])

  React.useLayoutEffect(() => {
    invalidate()
    return () => {
      helper.dispose()
      invalidate()
    }
  }, [helper, invalidate])

  return <primitive object={helper} />
}
