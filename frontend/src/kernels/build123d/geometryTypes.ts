/**
 * OCCT's surface and curve type codes, as ocp_tessellate reports them in
 * `face_types` and `edge_types`.
 *
 * The order is GeomAbs_SurfaceType and GeomAbs_CurveType, read off the OCP
 * bindings rather than transcribed - a wrong entry here mislabels every face of
 * that kind, which is the sort of error nobody notices for months.
 */
const SURFACE_TYPES = [
  'Plane',
  'Cylinder',
  'Cone',
  'Sphere',
  'Torus',
  'Bezier',
  'BSpline',
  'Revolution',
  'Extrusion',
  'Offset',
  'Other',
]

const CURVE_TYPES = [
  'Line',
  'Circle',
  'Ellipse',
  'Hyperbola',
  'Parabola',
  'Bezier',
  'BSpline',
  'Offset',
  'Other',
]

export function surfaceTypeName(code: number | undefined): string | undefined {
  return code === undefined ? undefined : SURFACE_TYPES[code]
}

export function curveTypeName(code: number | undefined): string | undefined {
  return code === undefined ? undefined : CURVE_TYPES[code]
}
