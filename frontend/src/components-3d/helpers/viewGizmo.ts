import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export type GizmoPlacement =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left'

/**
 * The renderer surface the gizmo needs.
 *
 * Structural rather than `WebGLRenderer`, because the app draws through
 * `WebGPURenderer` and the two share no base class carrying these.
 */
type GizmoRenderer = {
  domElement: HTMLCanvasElement
  autoClear: boolean
  isWebGPURenderer?: boolean
  getViewport(target: THREE.Vector4): THREE.Vector4
  setViewport(x: number, y: number, width: number, height: number): void
  render(scene: THREE.Object3D, camera: THREE.Camera): void
  clearDepth(): void
}

type ViewGizmoOptions = {
  camera: THREE.Camera
  renderer: GizmoRenderer
  /** Positioned ancestor of the canvas; the hit area is appended here. */
  container: HTMLElement
  placement?: GizmoPlacement
  size?: number
  /** Called whenever the gizmo changes something, to request a frame. */
  onChange?: () => void
}

const AXIS_COLORS = [
  new THREE.Color(0xff3653),
  new THREE.Color(0x8adb00),
  new THREE.Color(0x2c8fff),
]

const AXIS_NAMES = ['x', 'y', 'z'] as const

/** Seconds a click-to-align swing takes. */
const SWING_DURATION = 0.4

/** Pointer travel, in pixels, still counted as a click rather than a drag. */
const CLICK_SLOP = 6

const Y_AXIS = new THREE.Vector3(0, 1, 0)

function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

/**
 * The corner navigation gizmo: hover to highlight, click to align, drag to
 * orbit.
 *
 * Written rather than taken from `three/addons`, and rather than kept as the
 * widely copied JS version, because both align the camera by slerping to
 * hardcoded Y-up quaternions. This app is Z-up - which is what CAD means - so
 * those land the view rolled ninety degrees on X and upside down on Y. Here the
 * camera's own `up` decides, and orientation is handed to the orbit controls so
 * they cannot disagree with it afterwards.
 *
 * All state is per-instance. The version this is modelled on keeps its
 * quaternions, radius and clock at module scope, which two viewers would share.
 */
export class ViewGizmo extends THREE.Object3D {
  readonly isViewGizmo = true

  private readonly camera: THREE.Camera
  private readonly renderer: GizmoRenderer
  private readonly size: number
  private readonly placement: GizmoPlacement
  private readonly onChange?: () => void

  private readonly orthoCamera = new THREE.OrthographicCamera(
    -1.8,
    1.8,
    1.8,
    -1.8,
    0,
    4,
  )
  private readonly backdrop: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >
  private readonly axisLines: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >
  private readonly handles: THREE.Sprite[]
  private readonly hitArea: HTMLDivElement

  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly savedViewport = new THREE.Vector4()
  private readonly facing = new THREE.Vector3()
  private readonly swingRotation = new THREE.Quaternion()
  private readonly swingStep = new THREE.Quaternion()

  private controls: OrbitControls | null = null
  private readonly onControlsChange = () => this.faceCamera()

  private target = new THREE.Vector3()
  private dragging = false
  private swing: {
    from: THREE.Vector3
    to: THREE.Vector3
    radius: number
    elapsed: number
  } | null = null

  constructor({
    camera,
    renderer,
    container,
    placement = 'bottom-right',
    size = 128,
    onChange,
  }: ViewGizmoOptions) {
    super()

    this.camera = camera
    this.renderer = renderer
    this.size = size
    this.placement = placement
    this.onChange = onChange

    this.orthoCamera.position.set(0, 0, 2)

    this.backdrop = createBackdrop()
    this.axisLines = createAxisLines()
    this.handles = createHandles()
    this.add(this.backdrop, this.axisLines, ...this.handles)

    this.hitArea = createHitArea(placement, size)
    container.appendChild(this.hitArea)

    this.hitArea.addEventListener('pointerdown', this.onPointerDown)
    this.hitArea.addEventListener('pointermove', this.onPointerMove)
    this.hitArea.addEventListener('pointerleave', this.onPointerLeave)

    this.faceCamera()
  }

  setControls(controls: OrbitControls | null) {
    this.controls?.removeEventListener('change', this.onControlsChange)

    this.controls = controls
    this.target = controls ? controls.target : new THREE.Vector3()
    controls?.addEventListener('change', this.onControlsChange)

    this.faceCamera()
  }

  /** Advances a click-to-align swing. True while one is still running. */
  update(delta: number): boolean {
    const swing = this.swing
    if (!swing) {
      return false
    }

    swing.elapsed += delta
    const t = Math.min(1, swing.elapsed / SWING_DURATION)

    // Turned along the sphere rather than lerped across it, which would pass
    // through the centre on a half turn.
    this.swingRotation.setFromUnitVectors(swing.from, swing.to)
    this.swingStep.identity().slerp(this.swingRotation, smoothstep(t))

    this.facing.copy(swing.from).applyQuaternion(this.swingStep)
    this.camera.position
      .copy(this.target)
      .addScaledVector(this.facing, swing.radius)
    this.orientCamera()

    if (t >= 1) {
      this.swing = null
    }
    return true
  }

  /** Draws the gizmo into its corner of the frame already rendered. */
  render() {
    this.faceCamera()

    const canvas = this.renderer.domElement
    const [vertical, horizontal] = this.placement.split('-')

    const fromTop =
      vertical === 'top' ? 0 : Math.max(0, canvas.offsetHeight - this.size)
    const fromLeft =
      horizontal === 'left' ? 0 : Math.max(0, canvas.offsetWidth - this.size)

    // WebGPU counts viewport rows from the top where WebGL counts from the
    // bottom, and it is the only place the two disagree here.
    const y = this.renderer.isWebGPURenderer
      ? fromTop
      : canvas.offsetHeight - fromTop - this.size

    // The colour buffer holds the frame this draws over, so it has to survive.
    const autoClear = this.renderer.autoClear
    this.renderer.autoClear = false
    this.renderer.clearDepth()
    this.renderer.getViewport(this.savedViewport)
    this.renderer.setViewport(fromLeft, y, this.size, this.size)
    this.renderer.render(this, this.orthoCamera)
    this.renderer.setViewport(
      this.savedViewport.x,
      this.savedViewport.y,
      this.savedViewport.z,
      this.savedViewport.w,
    )
    this.renderer.autoClear = autoClear
  }

  dispose() {
    this.hitArea.removeEventListener('pointerdown', this.onPointerDown)
    this.hitArea.removeEventListener('pointermove', this.onPointerMove)
    this.hitArea.removeEventListener('pointerleave', this.onPointerLeave)
    this.hitArea.remove()

    this.controls?.removeEventListener('change', this.onControlsChange)

    this.axisLines.geometry.dispose()
    this.axisLines.material.dispose()
    this.backdrop.geometry.dispose()
    this.backdrop.material.dispose()

    for (const handle of this.handles) {
      handle.material.map?.dispose()
      handle.material.dispose()
    }
  }

  /** Poses the gizmo opposite the camera and fades the axes pointing away. */
  private faceCamera() {
    this.quaternion.copy(this.camera.quaternion).invert()
    this.updateMatrixWorld()

    this.facing.set(0, 0, 1).applyQuaternion(this.camera.quaternion)

    AXIS_NAMES.forEach((axis, index) => {
      const towards = this.facing[axis] >= 0
      this.handles[index].material.opacity = towards ? 1 : 0.5
      this.handles[index + 3].material.opacity = towards ? 0.5 : 1
    })
  }

  private orientCamera() {
    if (this.controls) {
      // The controls derive orientation from camera.up on every update, so
      // letting them do it is what keeps a Z-up scene upright - and stops them
      // snapping the roll the next time the user touches the mouse.
      this.controls.update()
    } else {
      this.camera.lookAt(this.target)
    }
    this.faceCamera()
    this.onChange?.()
  }

  private pick(event: PointerEvent): THREE.Sprite | null {
    const rect = this.hitArea.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.orthoCamera)
    const hit = this.raycaster.intersectObjects(this.handles, false)[0]
    return hit ? (hit.object as THREE.Sprite) : null
  }

  private resetHandles() {
    this.handles.forEach((handle, index) => {
      handle.scale.setScalar(index < 3 ? 0.6 : 0.4)
      // Both states share one texture; 1 wraps back onto the coloured half,
      // 0.5 lands on the plain one.
      handle.material.map?.offset.setX(1)
    })
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    if (this.dragging) {
      return
    }

    this.backdrop.material.opacity = 0.1
    const handle = this.pick(event)
    this.resetHandles()

    if (handle) {
      handle.material.map?.offset.setX(0.5)
      handle.scale.multiplyScalar(1.2)
      this.hitArea.style.cursor = 'pointer'
    } else {
      this.hitArea.style.cursor = ''
    }
    this.onChange?.()
  }

  private readonly onPointerLeave = () => {
    if (this.dragging) {
      return
    }
    this.backdrop.material.opacity = 0
    this.resetHandles()
    this.hitArea.style.cursor = ''
    this.onChange?.()
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.swing) {
      return
    }
    event.preventDefault()

    const startX = event.clientX
    const startY = event.clientY
    const width = this.hitArea.getBoundingClientRect().width
    let previousX = startX
    let previousY = startY

    const onMove = (move: PointerEvent) => {
      if (
        !this.dragging &&
        Math.hypot(move.clientX - startX, move.clientY - startY) < CLICK_SLOP
      ) {
        return
      }
      if (!this.dragging) {
        this.dragging = true
        this.resetHandles()
      }

      const scale = Math.PI / width
      this.orbitBy(
        (move.clientX - previousX) * scale,
        (move.clientY - previousY) * scale,
      )
      previousX = move.clientX
      previousY = move.clientY
    }

    const onUp = (up: PointerEvent) => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)

      if (this.dragging) {
        this.dragging = false
        return
      }
      this.alignTo(this.pick(up))
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  /**
   * Orbits by an azimuth and polar delta, around the camera's own up.
   *
   * The offset is rotated into a Y-up frame, moved in spherical coordinates and
   * rotated back - the same trick OrbitControls uses, and what makes this work
   * for any up rather than only for Y.
   */
  private orbitBy(azimuth: number, polar: number) {
    const toYUp = new THREE.Quaternion().setFromUnitVectors(
      this.camera.up,
      Y_AXIS,
    )
    const offset = this.camera.position.clone().sub(this.target)
    offset.applyQuaternion(toYUp)

    const spherical = new THREE.Spherical().setFromVector3(offset)
    spherical.theta -= azimuth
    spherical.phi -= polar
    spherical.makeSafe()

    offset.setFromSpherical(spherical).applyQuaternion(toYUp.invert())
    this.camera.position.copy(this.target).add(offset)
    this.orientCamera()
  }

  private alignTo(handle: THREE.Sprite | null) {
    if (!handle) {
      return
    }

    const to = (handle.userData.axis as THREE.Vector3).clone().normalize()
    const from = this.camera.position.clone().sub(this.target)
    const radius = from.length()
    if (radius < 1e-6) {
      return
    }

    this.swing = { from: from.normalize(), to, radius, elapsed: 0 }
    this.onChange?.()
  }
}

function createHitArea(placement: GizmoPlacement, size: number) {
  const div = document.createElement('div')
  const [vertical, horizontal] = placement.split('-')

  div.style.position = 'absolute'
  div.style.width = `${size}px`
  div.style.height = `${size}px`
  div.style.borderRadius = '100%'
  div.style.zIndex = '10'
  div.style.touchAction = 'none'
  div.style.top = vertical === 'top' ? '0px' : ''
  div.style.bottom = vertical === 'bottom' ? '0px' : ''
  div.style.left = horizontal === 'left' ? '0px' : ''
  div.style.right = horizontal === 'right' ? '0px' : ''

  return div
}

function createBackdrop() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1.6),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0,
      depthTest: false,
      toneMapped: false,
    }),
  )
}

function createAxisLines() {
  const reach = 0.9
  const position: number[] = []
  const color: number[] = []

  AXIS_NAMES.forEach((_, index) => {
    const end = [0, 0, 0]
    end[index] = reach
    position.push(...end, 0, 0, 0)

    const rgb = AXIS_COLORS[index].toArray()
    color.push(...rgb, ...rgb)
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(position, 3),
  )
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3))

  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false }),
  )
}

function createHandles() {
  return Array.from({ length: 6 }, (_, index) => {
    const positive = index < 3
    const axisIndex = index % 3
    const name = AXIS_NAMES[axisIndex]

    const sprite = new THREE.Sprite(
      createHandleMaterial(AXIS_COLORS[axisIndex], positive ? name : null),
    )

    const axis = new THREE.Vector3()
    axis.setComponent(axisIndex, positive ? 1 : -1)

    sprite.userData.axis = axis
    sprite.userData.label = `${positive ? '+' : '-'}${name}`
    sprite.position.copy(axis).multiplyScalar(1.2)
    sprite.scale.setScalar(positive ? 0.6 : 0.4)
    sprite.renderOrder = 1

    return sprite
  })
}

/**
 * Both states of a handle on one texture, side by side.
 *
 * `repeat.x = 0.5` shows half of it and `offset.x` chooses which, so hovering
 * swaps the look without touching the GPU.
 */
function createHandleMaterial(color: THREE.Color, label: string | null) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('The view gizmo needs a 2D canvas for its handles')
  }

  context.beginPath()
  context.arc(32, 32, 32, 0, Math.PI * 2)
  context.fillStyle = color.getStyle()
  context.fill()

  context.beginPath()
  context.arc(96, 32, 32, 0, Math.PI * 2)
  context.fillStyle = '#ffffff'
  context.fill()

  if (label) {
    context.font = 'bold 44px system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#0d0d0d'
    context.fillText(label.toUpperCase(), 32, 34)
    context.fillText(label.toUpperCase(), 96, 34)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.setX(0.5)
  texture.offset.setX(1)

  return new THREE.SpriteMaterial({
    map: texture,
    toneMapped: false,
    transparent: true,
  })
}
