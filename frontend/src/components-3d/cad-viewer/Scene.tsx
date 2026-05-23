import * as React from 'react'

import Controls from '../helpers/Controls'
import Stage, { type StageHandle } from '../helpers/Stage'
import { InfiniteGrid } from './InfiniteGrid'

export const Scene: React.FC<SceneProps> = ({
  children,
  hideGizmo = false,
  enableDamping = false,
  center,
  onRef,
}) => {
  const stageRef = React.useRef<StageHandle>(null)

  React.useEffect(() => {
    onRef?.(stageRef.current?.reset ?? (() => {}))
  }, [onRef])

  return (
    <>
      <Controls hideGizmo={hideGizmo} enableDamping={enableDamping} />
      <Stage ref={stageRef} center={center}>
        {children}
      </Stage>
      <InfiniteGrid />
    </>
  )
}

type SceneProps = {
  hideGizmo?: boolean
  enableDamping?: boolean
  center?: boolean
  children: React.ReactNode
  onRef?: (reset: () => void) => void
}
