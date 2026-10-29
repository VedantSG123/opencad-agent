import math

from build123d import Compound, Shape
from OCP.BRep import BRep_Tool
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.TopLoc import TopLoc_Location


def _finite(value):
    value = float(value)
    if not math.isfinite(value):
        raise ValueError('The kernel returned a non-finite measurement.')
    return value


def _point(vector):
    return [_finite(vector.X()), _finite(vector.Y()), _finite(vector.Z())]


def _measure(name, shape):
    box = shape.bounding_box()
    solids = shape.solids()
    shells = shape.shells()
    valid = shape.is_valid
    closed = all(BRep_Tool.IsClosed_s(shell.wrapped) for shell in shells) if shells else None
    outside = set(shape.faces())
    for solid in solids:
        outside.difference_update(solid.faces())
    area = _finite(shape.area)
    volume, center = None, None
    if valid and solids and closed and not outside:
        properties = GProp_GProps()
        BRepGProp.VolumeProperties_s(shape.wrapped, properties)
        measured = _finite(properties.Mass())
        if measured > 0:
            volume, center = measured, _point(properties.CentreOfMass())
    return {
        'kind': '3d',
        'name': name,
        'bounds': {'min': [_finite(v) for v in box.min], 'max': [_finite(v) for v in box.max]},
        'solidCount': len(solids),
        'valid': valid,
        'shellsClosed': closed,
        'surfaceArea': area,
        'volume': volume,
        'centerOfMass': center,
    }


def _overall(parts):
    if not parts or any(part['kind'] != '3d' for part in parts):
        return None
    return {
        'bounds': {
            'min': [min(part['bounds']['min'][axis] for part in parts) for axis in range(3)],
            'max': [max(part['bounds']['max'][axis] for part in parts) for axis in range(3)],
        },
        'solidCount': sum(part['solidCount'] for part in parts),
        'volumeSum': _finite(sum(part['volume'] for part in parts)) if all(part['volume'] is not None for part in parts) else None,
        'surfaceAreaSum': _finite(sum(part['surfaceArea'] for part in parts)) if all(part['surfaceArea'] is not None for part in parts) else None,
    }


def summarize_geometry(group, instances):
    parts = []

    def walk(node, parent):
        location = parent * node.loc if node.loc is not None else parent
        if node.kind == 'group':
            for child in node.objects:
                walk(child, location)
            return
        try:
            raw = instances[node.ref]['obj'] if node.ref is not None else node.obj
            if isinstance(raw, (tuple, list)):
                shape = Compound([Shape.cast(item) for item in raw])
                raw = shape.wrapped
            shape = Shape.cast(raw.Moved(location))
            parts.append(_measure(node.name, shape))
        except Exception as error:
            parts.append({'kind': 'unavailable', 'name': node.name, 'reason': str(error)})

    walk(group, TopLoc_Location())
    try:
        overall = _overall(parts)
    except (ValueError, OverflowError):
        overall = None
    return {'parts': parts, 'overall': overall}
