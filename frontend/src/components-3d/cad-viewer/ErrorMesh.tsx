import { useFrame, useThree } from '@react-three/fiber'
import * as React from 'react'
import * as THREE from 'three'
import { mx_noise_float, normalLocal, positionLocal, time } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

/**
 * The wobble drei's MeshDistortMaterial used to provide.
 *
 * That one patches `onBeforeCompile`, which a node-material renderer never
 * calls, so the displacement is a node graph instead: noise sampled in object
 * space, pushed along the normal, advanced by `time`.
 */
function createDistortMaterial(color: string, speed: number, distort: number) {
  const material = new MeshStandardNodeMaterial({ side: THREE.BackSide })
  material.color.set(color)

  const noise = mx_noise_float(positionLocal.add(time.mul(speed)))
  material.positionNode = positionLocal.add(normalLocal.mul(noise.mul(distort)))

  return material
}

export function ErrorMesh() {
  const camera = useThree((state) => state.camera)
  const set = useThree((state) => state.set)
  const frameloop = useThree((state) => state.frameloop)
  const originalFrameloop = React.useRef<typeof frameloop>(frameloop)

  const lightRef = React.useRef<THREE.DirectionalLight>(null)

  const material = React.useMemo(
    () => createDistortMaterial('#5a8296', 3, 0.6),
    [],
  )

  React.useEffect(() => {
    return () => material.dispose()
  }, [material])

  React.useLayoutEffect(() => {
    if (originalFrameloop.current !== 'demand') return
    set({ frameloop: 'always' })
    return () => set({ frameloop: 'demand' })
  }, [set])

  useFrame(() => {
    if (lightRef.current) {
      lightRef.current.position.copy(camera.position)
    }
  })

  return (
    <group>
      <ambientLight intensity={0.5} />
      <directionalLight ref={lightRef} intensity={1} />

      <mesh scale={100} material={material}>
        <sphereGeometry args={[1, 32, 32]} />
      </mesh>
    </group>
  )
}
