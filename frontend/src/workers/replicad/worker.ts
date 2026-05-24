import { expose } from 'comlink'
import * as replicad from 'replicad'
import type { OpenCascadeInstance } from 'replicad-opencascadejs/src/replicad_with_exceptions.js'

import { initOCC } from '@/kernels/replicad/init-occ'
import type { CleanedShape } from '@/kernels/replicad/shape-format'
import { getRenderOutput, isMeshShape } from '@/kernels/replicad/shape-format'
import type { ExportConfiguration, ExportFileTypes } from '@/types'

import { runFunctionWithContext } from './vm'

let loaded = false
let OC: OpenCascadeInstance | null = null
const SHAPE_MEMO: Record<string, CleanedShape[]> = {}
const DEFAULT_MEMO_KEY = 'default_shapes'

function getEditedCode(code: string) {
  return `
${code}
return main(replicad);
`
}

function runFunctionCode(code: string) {
  if (!loaded) {
    throw new Error('CAD worker not initialized')
  }

  const editedCode = getEditedCode(code)
  return runFunctionWithContext(editedCode, {
    replicad,
    OC,
  })
}

function formatException(oc: OpenCascadeInstance | null, e: unknown) {
  let message = 'Unknown Error'

  // refer: https://ocjs.org/docs/advanced/exceptions/catch-exceptions#extracting-exception-data
  if (typeof e === 'number') {
    if (oc) {
      message = oc.OCJS.getStandard_FailureData(e).GetMessageString()
    } else {
      message = 'OpenCascade.js not initialized'
    }
  } else if (e instanceof Error) {
    message = e.message
  }

  return {
    error: true,
    message,
    stack: e instanceof Error ? e.stack : undefined,
  }
}

function buildBlob(
  shape: replicad.AnyShape,
  fileType: ExportFileTypes,
  exportConfig: ExportConfiguration = {
    tolerance: 0.01,
    angularTolerance: 30,
  },
) {
  if (fileType === 'stl') {
    return (shape as unknown as ExportableShape).blobSTL(exportConfig)
  } else if (fileType === 'stl-binary') {
    return (shape as unknown as ExportableShape).blobSTL({
      ...exportConfig,
      binary: true,
    })
  } else if (fileType === 'step') {
    return (shape as unknown as ExportableShape).blobSTEP()
  }

  throw new Error(`Unsupported file type for export: ${fileType}`)
}

async function init() {
  if (loaded) {
    return Promise.resolve(true)
  }

  OC = await initOCC()

  loaded = true
  replicad.setOC(OC)

  return true
}

type LogEntry = {
  type: 'log' | 'info' | 'warn' | 'error'
  text: string
  timestamp: number
}

let capturedLogs: LogEntry[] = []

const originalLog = console.log
const originalInfo = console.info
const originalWarn = console.warn
const originalError = console.error

function startCapturingLogs() {
  capturedLogs = []
  const capture =
    (type: 'log' | 'info' | 'warn' | 'error') =>
    (...args: unknown[]) => {
      const text = args
        .map((arg) => {
          if (arg === null) return 'null'
          if (arg === undefined) return 'undefined'
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg)
            } catch {
              return '[Object]'
            }
          }
          if (typeof arg === 'string') return arg
          if (
            typeof arg === 'number' ||
            typeof arg === 'boolean' ||
            typeof arg === 'bigint' ||
            typeof arg === 'symbol'
          ) {
            return arg.toString()
          }
          if (typeof arg === 'function') {
            return arg.toString()
          }
          return ''
        })
        .join(' ')

      capturedLogs.push({
        type,
        text,
        timestamp: Date.now(),
      })
    }

  console.log = (...args: unknown[]) => {
    capture('log')(...args)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    originalLog(...(args as any[]))
  }
  console.info = (...args: unknown[]) => {
    capture('info')(...args)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    originalInfo(...(args as any[]))
  }
  console.warn = (...args: unknown[]) => {
    capture('warn')(...args)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    originalWarn(...(args as any[]))
  }
  console.error = (...args: unknown[]) => {
    capture('error')(...args)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    originalError(...(args as any[]))
  }
}

function stopCapturingLogs() {
  console.log = originalLog
  console.info = originalInfo
  console.warn = originalWarn
  console.error = originalError
  return capturedLogs
}

async function buildFromCode(code: string) {
  await init()

  startCapturingLogs()
  let shapes
  let errorResult = null

  try {
    shapes = runFunctionCode(code)
  } catch (e) {
    errorResult = formatException(OC, e)
  }

  const logs = stopCapturingLogs()

  if (errorResult) {
    return {
      error: true as const,
      message: errorResult.message,
      stack: errorResult.stack,
      logs,
    }
  }

  const renderOutput = getRenderOutput(shapes, (cleanedShapes) => {
    SHAPE_MEMO[DEFAULT_MEMO_KEY] = cleanedShapes
  })

  return {
    error: false as const,
    shapes: renderOutput,
    logs,
  }
}

function exportToFile(
  fileType: ExportFileTypes = 'stl',
  memoKey: string = DEFAULT_MEMO_KEY,
  config?: ExportConfiguration,
) {
  if (!SHAPE_MEMO[memoKey]) {
    throw new Error(`No shapes found in memo with key: ${memoKey}`)
  }

  const filteredShapesForExport = SHAPE_MEMO[memoKey]
    .map((shape) => {
      if (isMeshShape(shape.shape)) {
        return {
          shape: shape.shape,
          name: shape.name,
          color: shape.color,
          alpha: shape.opacity,
        } as ExportShapeConfig
      }

      return null
    })
    .filter(Boolean) as ExportShapeConfig[]

  if (fileType === 'step-assembly') {
    return [
      {
        blob: replicad.exportSTEP(filteredShapesForExport),
        name: memoKey,
      },
    ]
  }

  return filteredShapesForExport.map((shapeConfig) => {
    return {
      blob: buildBlob(shapeConfig.shape, fileType, config),
      name: memoKey,
    }
  })
}

function getFaceInfo(
  subShapeIndex: number,
  faceIndex: number,
  memoKey: string = DEFAULT_MEMO_KEY,
) {
  let face: replicad.Face | null = null

  const shape = SHAPE_MEMO[memoKey]?.[subShapeIndex]?.shape

  if (isMeshShape(shape)) {
    if (replicad.isShape3D(shape)) {
      face = (shape as unknown as ShapeGetters).faces?.[faceIndex] || null
    }
  }

  if (!face) {
    return face
  }

  return {
    type: face.geomType,
    center: face.center.toTuple(),
    normal: face.normalAt().normalize().toTuple(),
  }
}

function getEdgeInfo(
  subShapeIndex: number,
  edgeIndex: number,
  memoKey: string = DEFAULT_MEMO_KEY,
) {
  let edge: replicad.Edge | null = null

  const shape = SHAPE_MEMO[memoKey]?.[subShapeIndex]?.shape

  if (isMeshShape(shape)) {
    if (replicad.isShape3D(shape)) {
      edge = (shape as unknown as ShapeGetters).edges?.[edgeIndex] || null
    }
  }

  if (!edge) {
    return edge
  }

  return {
    type: edge.geomType,
    start: edge.startPoint.toTuple(),
    end: edge.endPoint.toTuple(),
    direction: edge.tangentAt().normalize().toTuple(),
  }
}

const service = {
  init,
  buildFromCode,
  exportToFile,
  getFaceInfo,
  getEdgeInfo,
}

expose(service)

type ExportShapeConfig = {
  shape: replicad.AnyShape
  name?: string
  color?: string
  alpha?: number
}

type ExportableShape = {
  blobSTL: (config: {
    tolerance?: number
    angularTolerance?: number
    binary?: boolean
  }) => Blob
  blobSTEP: () => Blob
}

type ShapeGetters = {
  faces?: replicad.Face[]
  edges?: replicad.Edge[]
}
