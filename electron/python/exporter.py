"""Export the objects shown by a fresh execution of the requested script.

Invoked as `python exporter.py` with one request on stdin naming the script,
the format and the output path.
"""

import json
import os
import sys

from script_runner import execute, exit_without_finalizing, read_request


def _single_shape(shown):
    from copy import deepcopy

    from build123d import Color, Compound, Location, Shape
    from ocp_tessellate.convert import to_ocpgroup

    group, instances = to_ocpgroup(
        *[entry["object"] for entry in shown],
        names=[entry["name"] for entry in shown],
        colors=[entry["color"] for entry in shown],
        alphas=[entry["alpha"] for entry in shown],
    )

    def convert(node):
        if node.kind == "group":
            shape = Compound(children=[convert(child) for child in node.objects])
        else:
            raw = instances[node.ref]["obj"] if node.ref is not None else node.obj
            if isinstance(raw, (tuple, list)):
                shape = Compound([deepcopy(Shape.cast(item)) for item in raw])
            else:
                shape = deepcopy(Shape.cast(raw))
            color = node.color
            if isinstance(color, tuple):
                raise ValueError("An export cannot apply multiple helper colors to one shape.")
            shape.color = Color(*color.percentage, color.a)
            shape.material = deepcopy(node.material)
        shape.label = node.name
        if node.loc is not None:
            shape.location = Location(node.loc)
        return shape

    if not group.objects:
        raise ValueError("The script showed no exportable shapes.")
    return convert(group)


def _world_leaves(shape):
    from copy import copy

    from build123d import Location

    def walk(node, parent):
        location = parent * node.location
        if node.children:
            for child in node.children:
                yield from walk(child, location)
        else:
            leaf = copy(node)
            leaf.parent = None
            leaf.location = location
            yield leaf

    return list(walk(shape, Location()))


def _export_step(shape, path):
    from build123d import export_step  # noqa: PLC0415

    export_step(shape, path)


def _export_stl(shape, path):
    from build123d import export_stl  # noqa: PLC0415

    export_stl(shape, path)


def _export_stl_ascii(shape, path):
    from build123d import export_stl  # noqa: PLC0415

    export_stl(shape, path, ascii_format=True)


def _export_3mf(shape, path):
    from build123d import Mesher, Unit  # noqa: PLC0415

    mesher = Mesher(unit=Unit.MM)
    mesher.add_shape(_world_leaves(shape))
    mesher.write(path)


def _export_glb(shape, path):
    from build123d import export_gltf  # noqa: PLC0415

    export_gltf(shape, path, binary=True)


# Named one per format rather than a table of flags: the 3MF path is a different
# class altogether, and STL's two variants differ by an argument that only STL
# has.
EXPORTERS = {
    "step": _export_step,
    "stl": _export_stl,
    "stl-ascii": _export_stl_ascii,
    "3mf": _export_3mf,
    "glb": _export_glb,
}


def main():
    request = read_request()
    fmt, output = request["format"], request["output"]

    write = EXPORTERS.get(fmt)
    if write is None:
        print(json.dumps({"ok": False, "error": f"Unsupported export format: {fmt}", "logs": "", "duration": 0}))
        return 0

    def produce(shown):
        write(_single_shape(shown), output)
        if not os.path.exists(output):
            return {"ok": False, "error": f"{fmt} export wrote no file"}
        return {"ok": True, "bytes": os.path.getsize(output)}

    json.dump(execute(request, produce), sys.stdout)
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    exit_without_finalizing(main())
