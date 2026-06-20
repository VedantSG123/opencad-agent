import * as THREE from 'three'

interface Vertex {
  x: number
  y: number
  z: number
}

interface Face {
  vertices: [number, number, number]
  colorIndex: number
}

type Color = [number, number, number, number]

const DEFAULT_FACE_COLOR: Color = [0.431, 0.659, 0.745, 1.0]

export function parseOffToGeometry(content: string): THREE.BufferGeometry {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))

  if (lines.length === 0) {
    throw new Error('Empty OFF file')
  }

  let counts: string
  let currentLine = 0
  if (lines[0].match(/^OFF(\s|$)/)) {
    counts = lines[0].substring(3).trim()
    currentLine = 1
  } else if (lines[currentLine] === 'OFF' && lines.length > 1) {
    counts = lines[1]
    currentLine = 2
  } else {
    counts = lines[0]
    currentLine = 1
  }

  const [numVertices, numFaces] = counts.split(/\s+/).map(Number)
  if (isNaN(numVertices) || isNaN(numFaces)) {
    throw new Error('Invalid OFF file: invalid vertex or face counts')
  }

  if (currentLine + numVertices + numFaces > lines.length) {
    throw new Error('Invalid OFF file: not enough lines')
  }

  const vertices: Vertex[] = []
  for (let i = 0; i < numVertices; i++) {
    const parts = lines[currentLine + i].split(/\s+/).map(Number)
    if (parts.length < 3 || parts.some(isNaN)) {
      throw new Error(
        `Invalid OFF file: invalid vertex at line ${currentLine + i + 1}`,
      )
    }
    vertices.push({ x: parts[0], y: parts[1], z: parts[2] })
  }
  currentLine += numVertices

  const colors: Color[] = []
  const colorMap = new Map<string, number>()

  const faces: Face[] = []
  for (let i = 0; i < numFaces; i++) {
    const parts = lines[currentLine + i].split(/\s+/).map(Number)
    const numVerts = parts[0]
    if (isNaN(numVerts) || numVerts < 3) {
      continue
    }
    const faceVertIndices = parts.slice(1, numVerts + 1)

    let color = DEFAULT_FACE_COLOR
    if (parts.length >= numVerts + 4) {
      color = parts.slice(numVerts + 1, numVerts + 5).map((c) => c / 255) as [
        number,
        number,
        number,
        number,
      ]
    }

    const colorKey = color.join(',')
    let colorIndex = colorMap.get(colorKey)
    if (colorIndex == null) {
      colorIndex = colors.length
      const [r, g, b, a] = color
      colors.push([r, g, b, a ?? 1])
      colorMap.set(colorKey, colorIndex)
    }

    if (faceVertIndices.length === 3) {
      faces.push({
        vertices: faceVertIndices as [number, number, number],
        colorIndex,
      })
    } else {
      for (let j = 1; j < faceVertIndices.length - 1; j++) {
        faces.push({
          vertices: [
            faceVertIndices[0],
            faceVertIndices[j],
            faceVertIndices[j + 1],
          ],
          colorIndex,
        })
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  const positions: number[] = []
  const vertexColors: number[] = []

  for (const face of faces) {
    const color = colors[face.colorIndex] || DEFAULT_FACE_COLOR
    for (const vIdx of face.vertices) {
      const vertex = vertices[vIdx]
      if (!vertex) continue
      positions.push(vertex.x, vertex.y, vertex.z)
      vertexColors.push(color[0], color[1], color[2])
    }
  }

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(vertexColors, 3),
  )
  geometry.computeVertexNormals()

  return geometry
}
