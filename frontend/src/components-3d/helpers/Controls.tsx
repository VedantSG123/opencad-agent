import { useFrame, useThree } from '@react-three/fiber'
import * as React from 'react'
import type { OrthographicCamera, PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const Controls: React.FC<ControlsProps> = ({ enableDamping = false }) => {
  const camera = useThree((state) => state.camera)
  const domElement = useThree((state) => state.gl.domElement)
  const invalidate = useThree((state) => state.invalidate)

  const controls = React.useMemo(
    () => new OrbitControls(camera as PerspectiveCamera | OrthographicCamera),
    [camera],
  )

  React.useEffect(() => {
    controls.connect(domElement)
    return () => controls.dispose()
  }, [controls, domElement])

  React.useEffect(() => {
    controls.enableDamping = enableDamping
  }, [controls, enableDamping])

  React.useEffect(() => {
    const request = () => invalidate()
    controls.addEventListener('change', request)
    return () => controls.removeEventListener('change', request)
  }, [controls, invalidate])

  useFrame(() => {
    if (controls.enabled) controls.update()
  }, -1)

  return null
}

export default Controls

type ControlsProps = {
  enableDamping?: boolean
}
