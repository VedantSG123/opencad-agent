import { useThree } from '@react-three/fiber'
import * as React from 'react'
import * as THREE from 'three'

import { useTheme } from '@/contexts/theme-context'

/** Span used until the stage has measured a model. */
const FALLBACK_REACH = 50

/** Target number of minor cells across the grid, before the step is rounded. */
const MINOR_DIVISIONS = 50

const MAJOR_EVERY = 10

const DARK = { minor: '#343434', major: '#4a4a4a', axis: '#6a6a6a' }
const LIGHT = { minor: '#e6e6e6', major: '#d2d2d2', axis: '#b4b4b4' }

/** Round a raw spacing up to the nearest 1, 2 or 5 times a power of ten. */
function niceStep(span: number, divisions: number) {
  const raw = span / divisions
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  const rounded =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return rounded * magnitude
}

function lineGeometry(points: number[]) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  return geometry
}

/**
 * The three tiers in one pass, so every line lands in the coarsest tier that
 * claims it - built separately they would stack a minor line under each major
 * one and double the overdraw on exactly the brightest pixels.
 */
function buildGrid(reach: number) {
  const step = niceStep(reach * 2, MINOR_DIVISIONS)
  const major = step * MAJOR_EVERY
  // Stop on a major line so the outer border is never a half cell.
  const half = Math.ceil(reach / major) * major
  const count = Math.round(half / step)

  const minorPoints: number[] = []
  const majorPoints: number[] = []
  const axisPoints: number[] = []

  for (let i = -count; i <= count; i++) {
    const offset = i * step
    const points =
      i === 0 ? axisPoints : i % MAJOR_EVERY === 0 ? majorPoints : minorPoints
    points.push(-half, offset, 0, half, offset, 0)
    points.push(offset, -half, 0, offset, half, 0)
  }

  return {
    minor: lineGeometry(minorPoints),
    major: lineGeometry(majorPoints),
    axis: lineGeometry(axisPoints),
  }
}

type GridProps = {
  /** Largest |x| or |y| the grid has to cover, measured from the world origin. */
  reach?: number
}

export function Grid({ reach = FALLBACK_REACH }: GridProps) {
  const { resolvedTheme } = useTheme()
  const invalidate = useThree((state) => state.invalidate)
  const colors = resolvedTheme === 'dark' ? DARK : LIGHT

  const span = Number.isFinite(reach) && reach > 0 ? reach : FALLBACK_REACH
  const geometries = React.useMemo(() => buildGrid(span), [span])

  React.useLayoutEffect(() => {
    invalidate()
    return () => {
      geometries.minor.dispose()
      geometries.major.dispose()
      geometries.axis.dispose()
      invalidate()
    }
  }, [geometries, invalidate])

  return (
    <group>
      <lineSegments geometry={geometries.minor}>
        <lineBasicMaterial color={colors.minor} toneMapped={false} />
      </lineSegments>
      <lineSegments geometry={geometries.major}>
        <lineBasicMaterial color={colors.major} toneMapped={false} />
      </lineSegments>
      <lineSegments geometry={geometries.axis}>
        <lineBasicMaterial color={colors.axis} toneMapped={false} />
      </lineSegments>
    </group>
  )
}
