import { z } from 'zod'

const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const finiteSchema = z.number().finite()
const resultFields = { logs: z.string(), duration: finiteSchema.nonnegative() }

const encodedBufferSchema = z.object({
  shape: z.array(countSchema).min(1),
  dtype: z.enum(['float32', 'uint32']),
  buffer: z.string(),
  codec: z.literal('b64'),
})
export type EncodedBuffer = z.infer<typeof encodedBufferSchema>

function scalarCount(buffer: EncodedBuffer | undefined): number {
  return buffer ? buffer.shape.reduce((count, size) => count * size, 1) : 0
}

function validateBuffer(buffer: EncodedBuffer, context: z.RefinementCtx) {
  const size = scalarCount(buffer)
  if (!Number.isSafeInteger(size) || !Number.isSafeInteger(size * 4)) {
    context.addIssue({
      code: 'custom',
      path: ['shape'],
      message: 'Buffer dimensions exceed a safe byte length.',
    })
    return
  }
  const encoded = buffer.buffer
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    context.addIssue({
      code: 'custom',
      path: ['buffer'],
      message: 'Expected padded base64 data.',
    })
    return
  }
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  if ((encoded.length * 3) / 4 - padding !== size * 4) {
    context.addIssue({
      code: 'custom',
      path: ['buffer'],
      message: 'Decoded byte length does not match the buffer dimensions.',
    })
  }
}

const floatBufferSchema = encodedBufferSchema
  .extend({ dtype: z.literal('float32') })
  .superRefine(validateBuffer)
const indexBufferSchema = encodedBufferSchema
  .extend({ dtype: z.literal('uint32') })
  .superRefine(validateBuffer)
const encodedInstanceSchema = z
  .object({
    vertices: floatBufferSchema.optional(),
    normals: floatBufferSchema.optional(),
    triangles: indexBufferSchema.optional(),
    edges: floatBufferSchema.optional(),
    obj_vertices: floatBufferSchema.optional(),
    face_types: indexBufferSchema.optional(),
    edge_types: indexBufferSchema.optional(),
    triangles_per_face: indexBufferSchema.optional(),
    segments_per_edge: indexBufferSchema.optional(),
    uvs: floatBufferSchema.optional(),
  })
  .superRefine((instance, context) => {
    const multipleOf = (field: keyof typeof instance, width: number) => {
      if (scalarCount(instance[field]) % width !== 0) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: `Expected complete groups of ${width} values.`,
        })
      }
    }
    multipleOf('vertices', 3)
    multipleOf('normals', 3)
    multipleOf('obj_vertices', 3)
    multipleOf('triangles', 3)
    multipleOf('edges', 6)
    const vertices = scalarCount(instance.vertices)
    const normals = scalarCount(instance.normals)
    if (
      (normals > 0 || scalarCount(instance.triangles) > 0) &&
      normals !== vertices
    ) {
      context.addIssue({
        code: 'custom',
        path: ['normals'],
        message: 'Normals must match the vertex count.',
      })
    }
    const uvs = scalarCount(instance.uvs)
    if (uvs !== 0 && uvs !== (vertices / 3) * 2) {
      context.addIssue({
        code: 'custom',
        path: ['uvs'],
        message: 'UV coordinates must have two values per vertex.',
      })
    }
    if (
      scalarCount(instance.face_types) !==
      scalarCount(instance.triangles_per_face)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['face_types'],
        message: 'Face types must match the per-face counts.',
      })
    }
    if (
      scalarCount(instance.edge_types) !==
      scalarCount(instance.segments_per_edge)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['edge_types'],
        message: 'Edge types must match the per-edge counts.',
      })
    }
  })
export type EncodedInstance = z.infer<typeof encodedInstanceSchema>

const shapeLocationSchema = z
  .tuple([
    z.tuple([finiteSchema, finiteSchema, finiteSchema]),
    z.tuple([finiteSchema, finiteSchema, finiteSchema, finiteSchema]),
  ])
  .refine(
    ([, quaternion]) =>
      Math.abs(quaternion.reduce((sum, value) => sum + value * value, 0) - 1) <
      1e-5,
    'Expected a unit quaternion.',
  )
export type ShapeLocation = z.infer<typeof shapeLocationSchema>

const boundingBoxSchema = z
  .object({
    xmin: finiteSchema,
    xmax: finiteSchema,
    ymin: finiteSchema,
    ymax: finiteSchema,
    zmin: finiteSchema,
    zmax: finiteSchema,
  })
  .refine(
    (bounds) =>
      bounds.xmin <= bounds.xmax &&
      bounds.ymin <= bounds.ymax &&
      bounds.zmin <= bounds.zmax,
    'Bounding-box minima must not exceed their maxima.',
  )
export type BoundingBox = z.infer<typeof boundingBoxSchema>

const inlineShapeSchema = encodedInstanceSchema
  .safeExtend({ ref: z.never().optional() })
  .transform(({ ref: _ref, ...shape }) => shape)
const shapeNodeSchema = z.object({
  name: z.string(),
  id: z.string().min(1),
  loc: shapeLocationSchema.nullable().optional(),
  get parts(): z.ZodOptional<z.ZodArray<typeof shapeNodeSchema>> {
    return z.array(shapeNodeSchema).optional()
  },
  shape: z
    .union([z.object({ ref: countSchema }), inlineShapeSchema])
    .nullable()
    .optional(),
  state: z
    .tuple([
      z.union([z.literal(0), z.literal(1), z.literal(3)]),
      z.union([z.literal(0), z.literal(1), z.literal(3)]),
    ])
    .optional(),
  type: z.string().optional(),
  subtype: z.string().optional(),
  color: z.union([z.string(), z.array(z.string())]).optional(),
  alpha: finiteSchema.min(0).max(1).optional(),
  renderback: z.boolean().optional(),
  bb: boundingBoxSchema.nullable().optional(),
})
export type ShapeNode = z.infer<typeof shapeNodeSchema>

const failureSchema = z.object({
  ok: z.literal(false),
  error: z.string().min(1),
  ...resultFields,
})
const previewSuccessSchema = z
  .object({
    ok: z.literal(true),
    instances: z.array(encodedInstanceSchema),
    shapes: shapeNodeSchema,
    ...resultFields,
  })
  .superRefine((result, context) => {
    const ids = new Set<string>()
    const visit = (node: ShapeNode, path: (string | number)[]) => {
      if (ids.has(node.id))
        context.addIssue({
          code: 'custom',
          path: [...path, 'id'],
          message: 'Assembly node IDs must be unique.',
        })
      ids.add(node.id)
      if (node.parts !== undefined) {
        if (node.shape != null)
          context.addIssue({
            code: 'custom',
            path,
            message: 'Assembly groups cannot also contain geometry.',
          })
        node.parts.forEach((part, index) =>
          visit(part, [...path, 'parts', index]),
        )
      } else if (!node.shape) {
        context.addIssue({
          code: 'custom',
          path,
          message: 'Assembly leaves must contain geometry.',
        })
      } else if ('ref' in node.shape) {
        if (node.shape.ref >= result.instances.length)
          context.addIssue({
            code: 'custom',
            path: [...path, 'shape', 'ref'],
            message: 'Geometry reference is outside the instance list.',
          })
      } else if (Object.keys(node.shape).length === 0) {
        context.addIssue({
          code: 'custom',
          path: [...path, 'shape'],
          message: 'Inline geometry must contain a buffer.',
        })
      }
    }
    visit(result.shapes, ['shapes'])
  })
const previewResultSchema = z.discriminatedUnion('ok', [
  previewSuccessSchema,
  failureSchema,
])
export type Build123dResult = z.infer<typeof previewResultSchema>

const exportReportSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    bytes: countSchema.positive(),
    ...resultFields,
  }),
  failureSchema,
])
export type Build123dExportReport = z.infer<typeof exportReportSchema>

function parseResult<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new Error(
      `Invalid build123d result at ${issue.path.join('.') || 'result'}: ${issue.message}`,
    )
  }
  return result.data
}

export function parseBuild123dResult(value: unknown): Build123dResult {
  return parseResult(previewResultSchema, value)
}

export function parseBuild123dExportReport(
  value: unknown,
): Build123dExportReport {
  return parseResult(exportReportSchema, value)
}

export type Build123dRunIdentity = {
  sessionId: string
  runId: string
}

export type Build123dProjectRequest = Build123dRunIdentity & {
  mainPath: string
  projectDirectory: string
  overrides?: Record<string, string>
}

export type Build123dSourceRequest = Build123dRunIdentity & { source: string }

export type Build123dCancelRequest = {
  sessionId: string
  runId?: string
}

/**
 * The 3D formats offered from the viewport.
 *
 * STEP leads because it is the only one that keeps exact geometry and the
 * assembly - labels and all - so it is what goes to a machinist or into
 * another CAD package. The rest are meshes: STL for printing, 3MF for printing
 * with colour and a fraction of STL's size, GLB for the web.
 *
 * OBJ and BREP are deliberately absent. OBJ writes no .mtl, so its materials
 * do not travel, and BREP is only readable by another OpenCascade program.
 */
export const BUILD123D_EXPORT_FORMATS = [
  'step',
  'stl',
  'stl-ascii',
  '3mf',
  'glb',
] as const

export type Build123dExportFormat = (typeof BUILD123D_EXPORT_FORMATS)[number]

/** The extension each format is written with; both STL variants are .stl. */
export const BUILD123D_EXPORT_EXTENSIONS: Record<
  Build123dExportFormat,
  string
> = {
  step: 'step',
  stl: 'stl',
  'stl-ascii': 'stl',
  '3mf': '3mf',
  glb: 'glb',
}

const exportResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    data: z
      .instanceof(Uint8Array)
      .refine(
        (data) => data.byteLength > 0,
        'Exported data must not be empty.',
      ),
    extension: z
      .string()
      .refine(
        (extension) =>
          Object.values(BUILD123D_EXPORT_EXTENSIONS).some(
            (value) => value === extension,
          ),
        'Unsupported export extension.',
      ),
    ...resultFields,
  }),
  failureSchema,
])
export type Build123dExportResult = z.infer<typeof exportResultSchema>

export function parseBuild123dExportResult(
  value: unknown,
): Build123dExportResult {
  return parseResult(exportResultSchema, value)
}
