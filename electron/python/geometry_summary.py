from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Literal, SupportsFloat, TypedDict

from build123d import Compound
from build123d.topology import Shape
from OCP.BRep import BRep_Tool
from OCP.BRepGProp import BRepGProp
from OCP.gp import gp_Pnt
from OCP.GProp import GProp_GProps
from OCP.TopLoc import TopLoc_Location
from ocp_tessellate.cad_objects import OcpGroup, OcpObject
from ocp_tessellate.types import Instance


class Bounds(TypedDict):
    min: list[float]
    max: list[float]


class MeasuredPart(TypedDict):
    kind: Literal['brep']
    name: str
    bounds: Bounds
    solidCount: int
    valid: bool
    shellsClosed: bool | None
    surfaceArea: float
    volume: float | None
    centerOfMass: list[float] | None


class UnavailablePart(TypedDict):
    kind: Literal['unavailable']
    name: str
    reason: str


GeometryPart = MeasuredPart | UnavailablePart


class OverallGeometry(TypedDict):
    bounds: Bounds
    solidCount: int
    volumeSum: float | None
    surfaceAreaSum: float


class GeometrySummary(TypedDict):
    parts: list[GeometryPart]
    overall: OverallGeometry | None


def _finite(value: SupportsFloat) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise ValueError('The kernel returned a non-finite measurement.')
    return number


def _point(vector: gp_Pnt) -> list[float]:
    return [_finite(vector.X()), _finite(vector.Y()), _finite(vector.Z())]


def _measure(name: str, shape: Shape) -> MeasuredPart:
    box = shape.bounding_box()
    solids = shape.solids()
    shells = shape.shells()
    valid = shape.is_valid
    closed = (
        all(BRep_Tool.IsClosed_s(shell.wrapped) for shell in shells)
        if shells
        else None
    )
    outside = set(shape.faces())
    for solid in solids:
        outside.difference_update(solid.faces())
    area = _finite(shape.area)
    volume: float | None = None
    center: list[float] | None = None
    if valid and solids and closed and not outside:
        properties = GProp_GProps()
        BRepGProp.VolumeProperties_s(shape.wrapped, properties)
        measured = _finite(properties.Mass())
        if measured > 0:
            volume, center = measured, _point(properties.CentreOfMass())
    return {
        'kind': 'brep',
        'name': name,
        'bounds': {
            'min': [_finite(v) for v in box.min],
            'max': [_finite(v) for v in box.max],
        },
        'solidCount': len(solids),
        'valid': valid,
        'shellsClosed': closed,
        'surfaceArea': area,
        'volume': volume,
        'centerOfMass': center,
    }


def _overall(parts: Sequence[GeometryPart]) -> OverallGeometry | None:
    measured = [part for part in parts if part['kind'] == 'brep']
    if not measured or len(measured) != len(parts):
        return None
    volumes: list[float] = []
    for part in measured:
        volume = part['volume']
        if volume is not None:
            volumes.append(volume)
    return {
        'bounds': {
            'min': [
                min(part['bounds']['min'][axis] for part in measured)
                for axis in range(3)
            ],
            'max': [
                max(part['bounds']['max'][axis] for part in measured)
                for axis in range(3)
            ],
        },
        'solidCount': sum(part['solidCount'] for part in measured),
        'volumeSum': _finite(sum(volumes))
        if len(volumes) == len(measured)
        else None,
        'surfaceAreaSum': _finite(
            sum(part['surfaceArea'] for part in measured)
        ),
    }


def summarize_geometry(
    group: OcpGroup, instances: Sequence[Instance]
) -> GeometrySummary:
    parts: list[GeometryPart] = []

    def walk(node: OcpGroup | OcpObject, parent: TopLoc_Location) -> None:
        location = parent * node.loc if node.loc is not None else parent
        if isinstance(node, OcpGroup):
            for child in node.objects:
                walk(child, location)
            return
        try:
            raw = (
                instances[node.ref]['obj'] if node.ref is not None else node.obj
            )
            if raw is None:
                raise ValueError('The part has no CAD geometry.')
            if isinstance(raw, (tuple, list)):
                shape = Compound([Shape.cast(item) for item in raw])
                raw = shape.wrapped
            shape = Shape.cast(raw.Moved(location))
            parts.append(_measure(node.name, shape))
        except Exception as error:
            parts.append(
                {'kind': 'unavailable', 'name': node.name, 'reason': str(error)}
            )

    walk(group, TopLoc_Location())
    try:
        overall = _overall(parts)
    except (ValueError, OverflowError):
        overall = None
    return {'parts': parts, 'overall': overall}
