"""Export the objects shown by a fresh execution of the requested script.

Invoked as `python exporter.py` with one request on stdin naming the script,
the format and the output path.
"""

from __future__ import annotations

import json
import os
import sys
from collections.abc import Callable, Iterator, Sequence
from typing import TYPE_CHECKING

from pipeline_types import ShownObject
from script_runner import execute, exit_without_finalizing, read_request

if TYPE_CHECKING:
    from build123d import Location
    from build123d.topology import Shape
    from ocp_tessellate.cad_objects import OcpGroup, OcpObject


def _single_shape(shown: Sequence[ShownObject]) -> Shape:
    from copy import deepcopy

    from build123d import Color, Compound, Location
    from build123d.topology import Shape
    from ocp_tessellate.cad_objects import OcpGroup
    from ocp_tessellate.convert import to_ocpgroup

    group, instances = to_ocpgroup(
        *[entry['object'] for entry in shown],
        names=[entry['name'] for entry in shown],
        colors=[entry['color'] for entry in shown],
        alphas=[entry['alpha'] for entry in shown],
    )

    def convert(node: OcpGroup | OcpObject) -> Shape:
        if isinstance(node, OcpGroup):
            shape = Compound(
                children=[convert(child) for child in node.objects]
            )
        else:
            raw = (
                instances[node.ref]['obj'] if node.ref is not None else node.obj
            )
            if raw is None:
                raise ValueError('The part has no CAD geometry.')
            if isinstance(raw, (tuple, list)):
                shape = Compound([deepcopy(Shape.cast(item)) for item in raw])
            else:
                shape = deepcopy(Shape.cast(raw))
            color = node.color
            if isinstance(color, list):
                raise ValueError(
                    'An export cannot apply multiple helper colors to one shape.'
                )
            if color is None:
                raise ValueError('The part has no resolved color.')
            red, green, blue = color.percentage
            shape.color = Color(red, green, blue, color.a)
            shape.material = deepcopy(node.material)
        shape.label = node.name or ''
        if node.loc is not None:
            shape.location = Location(node.loc)
        return shape

    if not group.objects:
        raise ValueError('The script showed no exportable shapes.')
    return convert(group)


def _world_leaves(shape: Shape) -> list[Shape]:
    from copy import copy

    from build123d import Location
    from build123d.topology import Shape

    def walk(node: Shape, parent: Location) -> Iterator[Shape]:
        location = parent * node.location
        if node.children:
            for child in node.children:
                if not isinstance(child, Shape):
                    raise TypeError('Assembly children must be CAD shapes.')
                yield from walk(child, location)
        else:
            leaf = copy(node)
            leaf.parent = None
            leaf.location = location
            yield leaf

    return list(walk(shape, Location()))


def _export_step(shape: Shape, path: str) -> None:
    from build123d import export_step

    export_step(shape, path)


def _export_stl(shape: Shape, path: str) -> None:
    from build123d import export_stl

    export_stl(shape, path)


def _export_stl_ascii(shape: Shape, path: str) -> None:
    from build123d import export_stl

    export_stl(shape, path, ascii_format=True)


def _export_3mf(shape: Shape, path: str) -> None:
    from build123d import Mesher, Unit

    mesher = Mesher(unit=Unit.MM)
    mesher.add_shape(_world_leaves(shape))
    mesher.write(path)


def _export_glb(shape: Shape, path: str) -> None:
    from build123d import export_gltf

    export_gltf(shape, path, binary=True)


EXPORTERS: dict[str, Callable[[Shape, str], None]] = {
    'step': _export_step,
    'stl': _export_stl,
    'stl-ascii': _export_stl_ascii,
    '3mf': _export_3mf,
    'glb': _export_glb,
}


def main() -> int:
    request = read_request()
    fmt, output = request.get('format'), request.get('output')
    if not isinstance(fmt, str) or not isinstance(output, str):
        raise ValueError('An export request requires format and output paths.')

    write = EXPORTERS.get(fmt)
    if write is None:
        print(
            json.dumps(
                {
                    'ok': False,
                    'error': f'Unsupported export format: {fmt}',
                    'logs': '',
                    'duration': 0,
                }
            )
        )
        return 0

    def produce(shown: list[ShownObject]) -> dict[str, object]:
        write(_single_shape(shown), output)
        if not os.path.exists(output):
            return {'ok': False, 'error': f'{fmt} export wrote no file'}
        return {'ok': True, 'bytes': os.path.getsize(output)}

    json.dump(execute(request, produce), sys.stdout)
    sys.stdout.flush()
    return 0


if __name__ == '__main__':
    exit_without_finalizing(main())
