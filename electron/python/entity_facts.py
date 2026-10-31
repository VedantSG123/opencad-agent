import math

from build123d import Edge, Face
from build123d.topology.shape_core import downcast
from ocp_tessellate.ocp_utils import (
    TopTools_IndexedDataMapOfShapeListOfShape,
    TopTools_IndexedMapOfShape,
    get_edge_type,
    get_face_type,
)
from OCP.BRep import BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Surface
from OCP.BRepGProp import BRepGProp
from OCP.BRepLib import BRepLib
from OCP.GeomAbs import GeomAbs_G1
from OCP.GProp import GProp_GProps
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE, TopAbs_REVERSED
from OCP.TopExp import TopExp
from OCP.TopLoc import TopLoc_Location


def _finite(value):
    value = float(value)
    if not math.isfinite(value):
        raise ValueError('The kernel returned a non-finite measurement.')
    return value


def _xyz(value):
    return [_finite(value.X()), _finite(value.Y()), _finite(value.Z())]


def _fact(name, quantity, value):
    return {'name': name, 'quantity': quantity, 'value': value}


def _face_facts(face):
    properties = GProp_GProps()
    BRepGProp.SurfaceProperties_s(face, properties)
    facts = [
        _fact('area', 'area', _finite(properties.Mass())),
        _fact('centroid', 'point', _xyz(properties.CentreOfMass())),
    ]
    surface = BRepAdaptor_Surface(face)
    kind = Face(face).geom_type.name
    if kind == 'PLANE':
        # The plane's own axis ignores the face's orientation, so a reversed
        # face would report the inward normal.
        normal = surface.Plane().Axis().Direction()
        if face.Orientation() == TopAbs_REVERSED:
            normal = normal.Reversed()
        facts.append(_fact('normal', 'direction', _xyz(normal)))
    elif kind == 'CYLINDER':
        cylinder = surface.Cylinder()
        facts.append(_fact('radius', 'length', _finite(cylinder.Radius())))
        facts.append(_fact('axis', 'direction', _xyz(cylinder.Axis().Direction())))
    elif kind == 'CONE':
        cone = surface.Cone()
        facts.append(_fact('apex', 'point', _xyz(cone.Apex())))
        facts.append(_fact('axis', 'direction', _xyz(cone.Axis().Direction())))
        facts.append(_fact('halfAngle', 'angle', math.degrees(abs(_finite(cone.SemiAngle())))))
    elif kind == 'SPHERE':
        sphere = surface.Sphere()
        facts.append(_fact('center', 'point', _xyz(sphere.Location())))
        facts.append(_fact('radius', 'length', _finite(sphere.Radius())))
    elif kind == 'TORUS':
        torus = surface.Torus()
        facts.append(_fact('center', 'point', _xyz(torus.Location())))
        facts.append(_fact('axis', 'direction', _xyz(torus.Axis().Direction())))
        facts.append(_fact('majorRadius', 'length', _finite(torus.MajorRadius())))
        facts.append(_fact('minorRadius', 'length', _finite(torus.MinorRadius())))
    return {'type': kind, 'facts': facts}


def _distinct_faces(owners):
    # Iterating an OCCT shape list from Python costs milliseconds per list,
    # and an edge almost always has one or two faces, which First and Last
    # reach directly. A seam lists its one face twice.
    size = owners.Size()
    listed = [owners.First(), owners.Last()][:size] if size <= 2 else list(owners)
    found = []
    for face in map(downcast, listed):
        if not any(face.IsSame(held) for held in found):
            found.append(face)
    return found


def _edge_class(edge, faces):
    if any(BRep_Tool.IsClosed_s(edge, face) for face in faces):
        return 'seam'
    if len(faces) == 1:
        return 'boundary'
    if len(faces) > 2:
        return 'nonmanifold'
    if int(BRep_Tool.Continuity_s(edge, faces[0], faces[1])) >= int(GeomAbs_G1):
        return 'tangent'
    return 'feature'


def _edge_facts(edge, faces, adjacent):
    properties = GProp_GProps()
    BRepGProp.LinearProperties_s(edge, properties)
    curve = BRepAdaptor_Curve(edge)
    kind = Edge(edge).geom_type.name
    facts = [
        _fact('length', 'length', _finite(properties.Mass())),
        _fact('start', 'point', _xyz(curve.Value(curve.FirstParameter()))),
        _fact('end', 'point', _xyz(curve.Value(curve.LastParameter()))),
    ]
    if kind == 'LINE':
        facts.append(_fact('direction', 'direction', _xyz(curve.Line().Direction())))
    elif kind == 'CIRCLE':
        circle = curve.Circle()
        sweep = abs(curve.LastParameter() - curve.FirstParameter())
        facts.append(_fact('center', 'point', _xyz(circle.Location())))
        facts.append(_fact('radius', 'length', _finite(circle.Radius())))
        facts.append(_fact('axis', 'direction', _xyz(circle.Axis().Direction())))
        facts.append(_fact('sweep', 'angle', math.degrees(min(_finite(sweep), 2 * math.pi))))
    elif kind == 'ELLIPSE':
        ellipse = curve.Ellipse()
        facts.append(_fact('center', 'point', _xyz(ellipse.Location())))
        facts.append(_fact('axis', 'direction', _xyz(ellipse.Axis().Direction())))
        facts.append(_fact('majorRadius', 'length', _finite(ellipse.MajorRadius())))
        facts.append(_fact('minorRadius', 'length', _finite(ellipse.MinorRadius())))
    facts.append(_fact('class', 'label', _edge_class(edge, faces)))
    facts.append(_fact('faces', 'faces', adjacent))
    return {'type': kind, 'facts': facts}


def _face_map(shape):
    found = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(shape, TopAbs_FACE, found)
    return found


def _meshed_faces(found):
    """Faces in ocp_tessellate's order, keeping only the ones it drew.

    ocp_tessellate walks `TopExp.MapShapes` and skips a face without a
    triangulation, so its `face_types` index is not the kernel's ordinal.
    """
    faces = []
    for ordinal in range(1, found.Extent() + 1):
        face = downcast(found.FindKey(ordinal))
        if BRep_Tool.Triangulation_s(face, TopLoc_Location()) is not None:
            faces.append((ordinal, face))
    return faces


def _meshed_edges(shape):
    """Edges in ocp_tessellate's order, keeping only the ones it drew.

    It skips an edge with no face, and one without a polygon on the
    triangulation of its first face.
    """
    found = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(shape, TopAbs_EDGE, found)
    ancestors = TopTools_IndexedDataMapOfShapeListOfShape()
    TopExp.MapShapesAndAncestors_s(shape, TopAbs_EDGE, TopAbs_FACE, ancestors)
    edges = []
    for ordinal in range(1, found.Extent() + 1):
        edge = downcast(found.FindKey(ordinal))
        owners = ancestors.FindFromKey(edge)
        if owners.Size() == 0:
            continue
        location = TopLoc_Location()
        triangulation = BRep_Tool.Triangulation_s(downcast(owners.First()), location)
        if triangulation is None:
            continue
        if BRep_Tool.PolygonOnTriangulation_s(edge, triangulation, location) is None:
            continue
        faces = _distinct_faces(owners)
        edges.append((ordinal, edge, faces))
    return edges


def _instance_facts(shape, face_types, edge_types):
    face_map = _face_map(shape)
    faces = _meshed_faces(face_map)
    edges = _meshed_edges(shape)
    if [get_face_type(face) for _, face in faces] != list(face_types):
        return None
    if [get_edge_type(edge) for _, edge, _ in edges] != list(edge_types):
        return None
    # Continuity is only recorded on the shape once regularity is encoded;
    # until then every edge reads as C0 and no edge would class as tangent.
    BRepLib.EncodeRegularity_s(shape, 1e-3)
    # `faces` facts name the viewer's face index, which is what picking and
    # highlighting use; an unmeshed neighbour has no index and is left out.
    index_of = {ordinal: index for index, (ordinal, _) in enumerate(faces)}

    def adjacent(owners):
        ordinals = (face_map.FindIndex(owner) for owner in owners)
        return [index_of[ordinal] for ordinal in ordinals if ordinal in index_of]

    return {
        'faces': [{'ordinal': ordinal, **_face_facts(face)} for ordinal, face in faces],
        'edges': [
            {'ordinal': ordinal, **_edge_facts(edge, owners, adjacent(owners))}
            for ordinal, edge, owners in edges
        ],
    }


def entity_facts(instances, meshed):
    """Each meshed instance's face and edge facts, or None where they cannot
    be lined up with what the viewer draws.

    Must run after `tessellate_group`, which leaves the triangulations on the
    shapes and drops an instance whose mesh came out empty.

    ocp_tessellate caches meshes by `cache_id`, a hash of the serialized
    shape, so of two identical shapes only the first is meshed and carries a
    triangulation. Both have the same local geometry, so the first one's
    facts stand for every instance sharing its `cache_id`.
    """
    first = {}
    drawn = []
    for instance in instances:
        key = instance['cache_id']
        if key not in first:
            shape = instance['obj']
            if isinstance(shape, (tuple, list)):
                shape = shape[0] if len(shape) == 1 else None
            first[key] = shape
        if first[key] is None:
            return [None] * len(meshed)
        if _meshed_faces(_face_map(first[key])):
            drawn.append(key)
    if len(drawn) != len(meshed):
        return [None] * len(meshed)
    facts = {}
    for key, mesh in zip(drawn, meshed):
        if key not in facts:
            try:
                facts[key] = _instance_facts(first[key], mesh['face_types'], mesh['edge_types'])
            except Exception:
                facts[key] = None
    return [facts[key] for key in drawn]
