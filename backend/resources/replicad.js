// Replicad script - Rounded Box with Chamfered Top
//
// This script demonstrates basic solid modeling with replicad:
// - Creating a box primitive
// - Applying fillets to edges
// - Chamfering selected edges

const { drawRoundedRectangle } = replicad

const main = () => {
  const width = 60
  const depth = 40
  const height = 30
  const wallRadius = 3
  const topChamfer = 1.5

  // Sketch a rounded rectangle on the XY plane and extrude it
  const box = drawRoundedRectangle(width, depth, wallRadius)
    .sketchOnPlane('XY')
    .extrude(height)

  // Chamfer the top edges for a finished look
  const chamfered = box.chamfer(topChamfer, (e) => e.inPlane('XY', height))

  return chamfered
}
