from __future__ import annotations

import math
from collections.abc import Sequence
from typing import SupportsFloat

from build123d import Edge, Face
from OCP.BRep import BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Surface
from OCP.BRepGProp import BRepGProp
from OCP.BRepLib import BRepLib
from OCP.collections import List_TopoDS_Shape
from OCP.GeomAbs import GeomAbs_G1
from OCP.gp import gp_Dir, gp_Pnt
from OCP.GProp import GProp_GProps
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE, TopAbs_REVERSED
from OCP.TopExp import TopExp
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS, TopoDS_Edge, TopoDS_Face, TopoDS_Shape
from ocp_tessellate.ocp_utils import (
    TopTools_IndexedDataMapOfShapeListOfShape,
    TopTools_IndexedMapOfShape,
    get_edge_type,
    get_face_type,
)
from ocp_tessellate.types import Instance, Tessellation

from pipeline_types import EdgeClass, EntityFacts, Fact, InstanceFacts, Quantity


def _finite(value: SupportsFloat) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise ValueError('The kernel returned a non-finite measurement.')
    return number


def _xyz(value: gp_Pnt | gp_Dir) -> list[float]:
    return [_finite(value.X()), _finite(value.Y()), _finite(value.Z())]


def _fact(
    name: str, quantity: Quantity, value: float | list[float] | list[int] | str
) -> Fact:
    return {'name': name, 'quantity': quantity, 'value': value}


def _face_facts(ordinal: int, face: TopoDS_Face) -> EntityFacts:
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
        facts.append(
            _fact('axis', 'direction', _xyz(cylinder.Axis().Direction()))
        )
    elif kind == 'CONE':
        cone = surface.Cone()
        half_angle = math.degrees(abs(_finite(cone.SemiAngle())))
        facts.append(_fact('apex', 'point', _xyz(cone.Apex())))
        facts.append(_fact('axis', 'direction', _xyz(cone.Axis().Direction())))
        facts.append(_fact('halfAngle', 'angle', half_angle))
    elif kind == 'SPHERE':
        sphere = surface.Sphere()
        facts.append(_fact('center', 'point', _xyz(sphere.Location())))
        facts.append(_fact('radius', 'length', _finite(sphere.Radius())))
    elif kind == 'TORUS':
        torus = surface.Torus()
        facts.append(_fact('center', 'point', _xyz(torus.Location())))
        facts.append(_fact('axis', 'direction', _xyz(torus.Axis().Direction())))
        facts.append(
            _fact('majorRadius', 'length', _finite(torus.MajorRadius()))
        )
        facts.append(
            _fact('minorRadius', 'length', _finite(torus.MinorRadius()))
        )
    return {'ordinal': ordinal, 'type': kind, 'facts': facts}


def _distinct_faces(owners: List_TopoDS_Shape) -> list[TopoDS_Face]:
    # Iterating an OCCT shape list from Python costs milliseconds per list,
    # and an edge almost always has one or two faces, which First and Last
    # reach directly. A seam lists its one face twice.
    size = owners.Size()
    listed: list[TopoDS_Shape] = (
        [owners.First(), owners.Last()][:size] if size <= 2 else list(owners)
    )
    found: list[TopoDS_Face] = []
    for face in map(TopoDS.Face, listed):
        if not any(face.IsSame(held) for held in found):
            found.append(face)
    return found


def _edge_class(edge: TopoDS_Edge, faces: Sequence[TopoDS_Face]) -> EdgeClass:
    if any(BRep_Tool.IsClosed_s(edge, face) for face in faces):
        return 'seam'
    if len(faces) == 1:
        return 'boundary'
    if len(faces) > 2:
        return 'nonmanifold'
    continuity = BRep_Tool.Continuity_s(edge, faces[0], faces[1])
    if int(continuity) >= int(GeomAbs_G1):
        return 'tangent'
    return 'feature'


def _edge_facts(
    ordinal: int,
    edge: TopoDS_Edge,
    faces: Sequence[TopoDS_Face],
    adjacent: list[int],
) -> EntityFacts:
    properties = GProp_GProps()
    BRepGProp.LinearProperties_s(edge, properties)
    curve = BRepAdaptor_Curve(edge)
    first, last = curve.FirstParameter(), curve.LastParameter()
    kind = Edge(edge).geom_type.name
    facts = [
        _fact('length', 'length', _finite(properties.Mass())),
        _fact('start', 'point', _xyz(curve.Value(first))),
        _fact('end', 'point', _xyz(curve.Value(last))),
    ]
    if kind == 'LINE':
        direction = curve.Line().Direction()
        facts.append(_fact('direction', 'direction', _xyz(direction)))
    elif kind == 'CIRCLE':
        circle = curve.Circle()
        sweep = min(_finite(abs(last - first)), 2 * math.pi)
        facts.append(_fact('center', 'point', _xyz(circle.Location())))
        facts.append(_fact('radius', 'length', _finite(circle.Radius())))
        facts.append(
            _fact('axis', 'direction', _xyz(circle.Axis().Direction()))
        )
        facts.append(_fact('sweep', 'angle', math.degrees(sweep)))
    elif kind == 'ELLIPSE':
        ellipse = curve.Ellipse()
        facts.append(_fact('center', 'point', _xyz(ellipse.Location())))
        facts.append(
            _fact('axis', 'direction', _xyz(ellipse.Axis().Direction()))
        )
        facts.append(
            _fact('majorRadius', 'length', _finite(ellipse.MajorRadius()))
        )
        facts.append(
            _fact('minorRadius', 'length', _finite(ellipse.MinorRadius()))
        )
    facts.append(_fact('class', 'label', _edge_class(edge, faces)))
    facts.append(_fact('faces', 'faces', adjacent))
    return {'ordinal': ordinal, 'type': kind, 'facts': facts}


def _face_map(shape: TopoDS_Shape) -> TopTools_IndexedMapOfShape:
    found = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(shape, TopAbs_FACE, found)
    return found


def _meshed_faces(
    found: TopTools_IndexedMapOfShape,
) -> list[tuple[int, TopoDS_Face]]:
    """Faces in ocp_tessellate's order, keeping only the ones it drew.

    ocp_tessellate walks `TopExp.MapShapes` and skips a face without a
    triangulation, so its `face_types` index is not the kernel's ordinal.
    """
    faces: list[tuple[int, TopoDS_Face]] = []
    for ordinal in range(1, found.Extent() + 1):
        face = TopoDS.Face(found.FindKey(ordinal))
        if BRep_Tool.Triangulation_s(face, TopLoc_Location()) is not None:
            faces.append((ordinal, face))
    return faces


def _meshed_edges(
    shape: TopoDS_Shape,
) -> list[tuple[int, TopoDS_Edge, list[TopoDS_Face]]]:
    """Edges in ocp_tessellate's order, keeping only the ones it drew.

    It skips an edge with no face, and one without a polygon on the
    triangulation of its first face.
    """
    found = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(shape, TopAbs_EDGE, found)
    ancestors = TopTools_IndexedDataMapOfShapeListOfShape()
    TopExp.MapShapesAndAncestors_s(shape, TopAbs_EDGE, TopAbs_FACE, ancestors)
    edges: list[tuple[int, TopoDS_Edge, list[TopoDS_Face]]] = []
    for ordinal in range(1, found.Extent() + 1):
        edge = TopoDS.Edge(found.FindKey(ordinal))
        owners = ancestors.FindFromKey(edge)
        if owners.Size() == 0:
            continue
        location = TopLoc_Location()
        first = TopoDS.Face(owners.First())
        triangulation = BRep_Tool.Triangulation_s(first, location)
        if triangulation is None:
            continue
        polygon = BRep_Tool.PolygonOnTriangulation_s(
            edge, triangulation, location
        )
        if polygon is None:
            continue
        edges.append((ordinal, edge, _distinct_faces(owners)))
    return edges


def _instance_facts(
    shape: TopoDS_Shape,
    face_types: Sequence[int],
    edge_types: Sequence[int],
) -> InstanceFacts | None:
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

    def adjacent(owners: Sequence[TopoDS_Face]) -> list[int]:
        ordinals = (face_map.FindIndex(owner) for owner in owners)
        return [
            index_of[ordinal] for ordinal in ordinals if ordinal in index_of
        ]

    return {
        'faces': [_face_facts(ordinal, face) for ordinal, face in faces],
        'edges': [
            _edge_facts(ordinal, edge, owners, adjacent(owners))
            for ordinal, edge, owners in edges
        ],
    }


def entity_facts(
    instances: Sequence[Instance], meshed: Sequence[Tessellation]
) -> list[InstanceFacts | None]:
    """Each meshed instance's face and edge facts, or None where they cannot
    be lined up with what the viewer draws.

    Must run after `tessellate_group`, which leaves the triangulations on the
    shapes and drops an instance whose mesh came out empty.

    ocp_tessellate caches meshes by `cache_id`, a hash of the serialized
    shape, so of two identical shapes only the first is meshed and carries a
    triangulation. Both have the same local geometry, so the first one's
    facts stand for every instance sharing its `cache_id`.
    """
    first: dict[str, TopoDS_Shape] = {}
    drawn: list[str] = []
    for instance in instances:
        key = instance['cache_id']
        first.setdefault(key, instance['obj'])
        if _meshed_faces(_face_map(first[key])):
            drawn.append(key)
    if len(drawn) != len(meshed):
        return [None] * len(meshed)
    facts: dict[str, InstanceFacts | None] = {}
    for key, mesh in zip(drawn, meshed):
        if key not in facts:
            try:
                facts[key] = _instance_facts(
                    first[key],
                    list(mesh['face_types']),
                    list(mesh['edge_types']),
                )
            except Exception:
                facts[key] = None
    return [facts[key] for key in drawn]
