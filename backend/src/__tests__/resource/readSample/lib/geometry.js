export function makeCylinder(radius, height) {
  return { radius, height, kind: "cylinder" }
}

export function makeBox(width, depth, height) {
  return { width, depth, height, kind: "box" }
}
