import * as React from 'react'
import type * as THREE from 'three'

import Controls from '../helpers/Controls'
import Stage, { type StageHandle } from '../helpers/Stage'
import { ViewHelper } from '../helpers/ViewHelper'
import { Axes } from './Axes'
import { Grid } from './Grid'
import { PickingThreshold } from './PickingThreshold'

export const Scene: React.FC<SceneProps> = ({
  children,
  enableDamping = false,
  center,
  stageRef,
}) => {
  const [reach, setReach] = React.useState(0)

  const handleBounds = React.useCallback((bounds: THREE.Box3) => {
    setReach(
      Math.max(
        Math.abs(bounds.min.x),
        Math.abs(bounds.max.x),
        Math.abs(bounds.min.y),
        Math.abs(bounds.max.y),
      ),
    )
  }, [])

  return (
    <>
      <Controls enableDamping={enableDamping} />
      <PickingThreshold />
      <Stage ref={stageRef} center={center} onBounds={handleBounds}>
        {children}
      </Stage>
      <ViewHelper />
      <Grid reach={reach} />
      <Axes size={reach > 0 ? reach * 0.6 : 30} />
    </>
  )
}

type SceneProps = {
  enableDamping?: boolean
  center?: boolean
  children: React.ReactNode
  stageRef?: React.Ref<StageHandle>
}
