import type { EntityFact, EntityFacts } from 'shared/build123d'

import type { ComponentKind } from '@/types'

import type { DecodedPart } from './decode'
import { rotateByQuaternion } from './decode'

function placeFact(fact: EntityFact, part: DecodedPart): EntityFact {
  const [position, rotation] = part.location
  if (fact.quantity === 'direction') {
    return { ...fact, value: rotateByQuaternion(fact.value, rotation) }
  }
  if (fact.quantity === 'point') {
    const [x, y, z] = rotateByQuaternion(fact.value, rotation)
    return {
      ...fact,
      value: [x + position[0], y + position[1], z + position[2]],
    }
  }
  return fact
}

export function worldFacts(
  part: DecodedPart,
  kind: ComponentKind,
  index: number,
): EntityFacts | undefined {
  const local = part.instance.localFacts
  const entity = kind === 'face' ? local?.faces[index] : local?.edges[index]
  if (!entity) return undefined
  return {
    ...entity,
    facts: entity.facts.map((fact) => placeFact(fact, part)),
  }
}
