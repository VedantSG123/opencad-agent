import * as THREE from 'three'

/** Side of the square the gizmo is drawn into, in CSS pixels. */
export const GIZMO_SIZE = 128

const AXES: { axis: THREE.Vector3; label: string; color: string }[] = [
  { axis: new THREE.Vector3(1, 0, 0), label: 'X', color: '#ff4466' },
  { axis: new THREE.Vector3(0, 1, 0), label: 'Y', color: '#88ff44' },
  { axis: new THREE.Vector3(0, 0, 1), label: 'Z', color: '#4488ff' },
]

const HANDLE_SCALE = 0.42
const TEXTURE_SIZE = 64

function handleTexture(color: string, label?: string) {
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_SIZE
  canvas.height = TEXTURE_SIZE
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('The view gizmo needs a 2D canvas for its labels')
  }

  const radius = TEXTURE_SIZE / 2

  context.beginPath()
  context.arc(radius, radius, radius - 2, 0, Math.PI * 2)
  context.fillStyle = color
  context.fill()

  if (label) {
    context.font = `bold ${TEXTURE_SIZE * 0.55}px system-ui, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#0d0d0d'
    context.fillText(label, radius, radius + 1)
  } else {
    // A ring rather than a disc, so the far end of an axis reads as the one
    // pointing away without needing a second colour.
    context.globalCompositeOperation = 'destination-out'
    context.beginPath()
    context.arc(radius, radius, radius - 8, 0, Math.PI * 2)
    context.fill()
    context.globalCompositeOperation = 'source-over'
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export type ViewGizmo = {
  /** The axis under the pointer, in world space, or null. */
  hitTest(ndc: THREE.Vector2, camera: THREE.Camera): THREE.Vector3 | null
  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void
  dispose(): void
}

/**
 * The corner axis gizmo.
 *
 * Built rather than taken from `three/addons`: that one animates the camera to
 * hardcoded Y-up quaternions, so in a Z-up scene - which is what CAD means -
 * clicking X or Y lands the view rolled by ninety degrees, and the targets are
 * closure-private so there is nothing to override.
 *
 * The drawing approach is the addon's and worth keeping: the gizmo is given the
 * inverse of the camera's rotation and drawn with a fixed orthographic camera
 * into a corner of the viewport, which costs one extra draw and no second
 * canvas.
 */
export function createViewGizmo(): ViewGizmo {
  const root = new THREE.Object3D()
  const handles: THREE.Sprite[] = []
  const disposables: { dispose(): void }[] = []

  const orthoCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0, 4)
  orthoCamera.position.set(0, 0, 2)

  const linePoints: number[] = []
  const lineColors: number[] = []

  for (const { axis, label, color } of AXES) {
    const rgb = new THREE.Color(color)
    linePoints.push(0, 0, 0, axis.x, axis.y, axis.z)
    lineColors.push(rgb.r, rgb.g, rgb.b, rgb.r, rgb.g, rgb.b)

    for (const sign of [1, -1]) {
      const texture = handleTexture(color, sign > 0 ? label : undefined)
      const material = new THREE.SpriteMaterial({
        map: texture,
        toneMapped: false,
        transparent: true,
      })
      const sprite = new THREE.Sprite(material)
      sprite.position.copy(axis).multiplyScalar(sign)
      sprite.scale.setScalar(HANDLE_SCALE)
      sprite.userData.axis = axis.clone().multiplyScalar(sign)

      root.add(sprite)
      handles.push(sprite)
      disposables.push(texture, material)
    }
  }

  const lineGeometry = new THREE.BufferGeometry()
  lineGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(linePoints, 3),
  )
  lineGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(lineColors, 3),
  )
  const lineMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    toneMapped: false,
  })
  root.add(new THREE.LineSegments(lineGeometry, lineMaterial))
  disposables.push(lineGeometry, lineMaterial)

  const raycaster = new THREE.Raycaster()
  const viewport = new THREE.Vector4()

  function orient(camera: THREE.Camera) {
    root.quaternion.copy(camera.quaternion).invert()
    root.updateMatrixWorld(true)
  }

  return {
    hitTest(ndc, camera) {
      // Oriented first: a pointer event can arrive before the frame that would
      // otherwise have posed the gizmo.
      orient(camera)
      raycaster.setFromCamera(ndc, orthoCamera)
      const hit = raycaster.intersectObjects(handles, false)[0]
      return hit ? (hit.object.userData.axis as THREE.Vector3).clone() : null
    },

    render(renderer, camera) {
      orient(camera)

      const element = renderer.domElement
      const x = element.offsetWidth - GIZMO_SIZE
      // WebGPU counts viewport rows from the top where WebGL counts from the
      // bottom, which is the one place the two renderers disagree here.
      const y = (renderer as unknown as { isWebGPURenderer?: boolean })
        .isWebGPURenderer
        ? element.offsetHeight - GIZMO_SIZE
        : 0

      renderer.clearDepth()
      renderer.getViewport(viewport)
      renderer.setViewport(x, y, GIZMO_SIZE, GIZMO_SIZE)
      renderer.render(root, orthoCamera)
      renderer.setViewport(viewport.x, viewport.y, viewport.z, viewport.w)
    },

    dispose() {
      for (const item of disposables) {
        item.dispose()
      }
    },
  }
}
