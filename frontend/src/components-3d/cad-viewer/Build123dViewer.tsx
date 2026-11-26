import * as React from 'react'

import { picksByPart } from '@/components/cad/picks'
import { ErrorBoundary } from '@/components/custom/ErrorBoundary'
import type { Build123dInteraction } from '@/hooks/useBuild123dInteraction'
import { partsBounds } from '@/kernels/build123d/bounds'
import type { DecodedModel } from '@/kernels/build123d/decode'

import { Build123dPartMesh } from '../build123d-mesh/Build123dPartMesh'
import { SelectionBox } from '../build123d-mesh/SelectionBox'
import type { StageHandle } from '../helpers/Stage'
import { Canvas } from './Canvas'
import { ErrorMesh } from './ErrorMesh'
import { Scene } from './Scene'

type Build123dViewerProps = {
  model: DecodedModel | null
  interaction: Build123dInteraction
  hasError?: boolean
  stageRef?: React.Ref<StageHandle>
}

export const Build123dViewer: React.FC<Build123dViewerProps> = ({
  model,
  interaction,
  hasError = false,
  stageRef,
}) => {
  const { pickedParts } = interaction
  const selected = React.useMemo(() => {
    if (!model || !pickedParts.size) return null
    return partsBounds(model.parts.filter((part) => pickedParts.has(part.id)))
  }, [model, pickedParts])

  const highlighted = React.useMemo(
    () => picksByPart(interaction.picked),
    [interaction.picked],
  )

  return (
    <ErrorBoundary
      fallback={
        <div className='absolute inset-0 flex items-center justify-center text-sm text-muted-foreground'>
          3D viewer error — try rebuilding
        </div>
      }
    >
      <Canvas
        orthographic
        onPointerMissed={(event) => {
          if (!event.shiftKey) interaction.clearPicks()
        }}
      >
        <Scene stageRef={stageRef}>
          {hasError ? (
            <ErrorMesh />
          ) : (
            model?.parts.map((part) => (
              <Build123dPartMesh
                key={`${interaction.revision}:${part.id}`}
                part={part}
                visible={interaction.visibility[part.id]}
                mode={interaction.mode}
                picks={highlighted.get(part.id)}
                onPick={interaction.pick}
              />
            ))
          )}
          {selected && !hasError && <SelectionBox bounds={selected} />}
        </Scene>
      </Canvas>
    </ErrorBoundary>
  )
}
