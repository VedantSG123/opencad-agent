import type { EntityFact } from 'shared/build123d'

/** 'halfAngle' reads as 'Half angle'. */
export function factLabel(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function number(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

export function factValue(fact: EntityFact): string {
  switch (fact.quantity) {
    case 'length':
      return `${number(fact.value)} mm`
    case 'area':
      return `${number(fact.value)} mm²`
    case 'angle':
      return `${number(fact.value)}°`
    case 'point':
    case 'direction':
      return `(${fact.value.map(number).join(', ')})`
    case 'faces':
      return fact.value.join(', ')
    case 'label':
      return fact.value
  }
}
