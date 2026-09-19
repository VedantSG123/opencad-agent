import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/** How near an edge the pointer must come, in screen pixels. */
const EDGE_PICK_RADIUS = 6

/**
 * Hold edge picking to a fixed size on screen.
 *
 * three's Raycaster measures line hits in world units and defaults to 1, so on
 * a part a hundred units across the pointer is within tolerance of some edge
 * almost everywhere. Edges sit on the face surface, so they also win the depth
 * sort, and the face underneath never gets picked. A world threshold also means
 * picking gets looser as you zoom in, which is backwards.
 */
export function PickingThreshold() {
  const raycaster = useThree((state) => state.raycaster)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)

  useFrame(() => {
    if (size.height === 0) return

    let worldPerPixel: number
    if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
      const ortho = camera as THREE.OrthographicCamera
      worldPerPixel = (ortho.top - ortho.bottom) / ortho.zoom / size.height
    } else {
      const perspective = camera as THREE.PerspectiveCamera
      const distance = perspective.position.length()
      const frustumHeight =
        2 * distance * Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2)
      worldPerPixel = frustumHeight / size.height
    }

    raycaster.params.Line.threshold = EDGE_PICK_RADIUS * worldPerPixel
  })

  return null
}
