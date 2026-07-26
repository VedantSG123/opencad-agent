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
let dp = {}
try {
  dp = defaultParams;
} catch (error) {}

const flattenParams = (p) => {
  if (!p) return {};
  const flat = {};
  for (const [key, val] of Object.entries(p)) {
    if (val && typeof val === 'object' && 'value' in val) {
      flat[key] = val.value;
    } else {
      flat[key] = val;
    }
  }
  return flat;
};

return main(replicad, flattenParams(__inputParams || dp));
`
}

function runFunctionCode(code: string, params?: Record<string, unknown>) {
  if (!loaded) {
    throw new Error('CAD worker not initialized')
  }

  const editedCode = getEditedCode(code)
  return runFunctionWithContext(editedCode, {
    replicad,
    OC,
    __inputParams: params,
  })
}

function extractDefaultParams(code: string): Record<string, unknown> | null {
  if (!loaded) {
    throw new Error('CAD worker not initialized')
  }

  const checkCode = `
${code}
try {
  return defaultParams;
} catch (error) {
  return null;
}
  `
  try {
    return runFunctionWithContext(checkCode, {
      replicad,
      OC,
    })
  } catch {
    return null
  }
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
  // Performance workaround, not a correctness one: `OC` is assignable to
  // setOC's parameter without any cast. But structurally comparing
  // `OpenCascadeInstance` against that parameter type costs ~9s in the
  // TypeScript 7 Go checker (~0.7s in TS 5.9) and dominated both `tsc` and
  // oxlint's type-aware pass for the whole frontend. Casting the *function*
  // rather than the argument keeps the huge parameter type from being
  // resolved at all, which is what makes both tools fast again.
  // Revisit when https://github.com/microsoft/typescript-go/issues is fixed.
  ;(replicad.setOC as (oc: unknown) => void)(OC)

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

async function buildFromCode(code: string, params?: Record<string, unknown>) {
  await init()

  const defaultParams = extractDefaultParams(code)
  if (defaultParams && params) {
    for (const [key, value] of Object.entries(params)) {
      if (defaultParams[key] !== undefined) {
        const paramObj = defaultParams[key] as Record<string, unknown>
        if (paramObj && typeof paramObj === 'object' && 'value' in paramObj) {
          paramObj.value = value
        } else {
          defaultParams[key] = value
        }
      }
    }
  }

  startCapturingLogs()
  let shapes
  let errorResult = null

  try {
    shapes = runFunctionCode(code, params)
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
    defaultParams,
  }
}

async function exportToFile(
  fileType: ExportFileTypes = 'stl',
  memoKey: string = DEFAULT_MEMO_KEY,
  config?: ExportConfiguration,
) {
  await init()

  startCapturingLogs()
  let errorResult = null
  let resultFiles: Array<{ blob: Blob; name: string }> = []

  try {
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
          }
        }

        return null
      })
      .filter(Boolean) as ExportShapeConfig[]

    if (filteredShapesForExport.length === 0) {
      throw new Error('No 3D shapes found to export.')
    }

    if (fileType === 'step-assembly') {
      resultFiles = [
        {
          blob: replicad.exportSTEP(filteredShapesForExport),
          name: memoKey,
        },
      ]
    } else {
      resultFiles = filteredShapesForExport.map((shapeConfig) => {
        return {
          blob: buildBlob(shapeConfig.shape, fileType, config),
          name: shapeConfig.name || memoKey,
        }
      })
    }
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

  return {
    error: false as const,
    files: resultFiles,
    logs,
  }
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
