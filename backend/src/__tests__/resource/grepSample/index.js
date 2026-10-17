// Main entry point for the sample app.

import { makeBox } from './lib/utils'
import { makeCylinder } from './lib/geometry'

export function buildChassis() {
  const box = makeBox(10, 20, 30)
  return box
}

export function buildWheel() {
  const cylinder = makeCylinder(5, 2)
  return cylinder
}
