"""Export a build123d script's model to a 3D file.

Invoked as `python exporter.py` with one request on stdin naming the script,
the format and the output path. Running the script is `script_runner.execute`,
the same path the viewer's runner takes, so what is exported is what was last
shown rather than a second interpretation of the file.
"""

import json
import os
import sys

from script_runner import execute, exit_without_finalizing, read_request


def _single_shape(shown):
    """One shape to export, keeping labels and colours.

    Several shown objects become a Compound rather than being exported one at a
    time: STEP and 3MF both carry an assembly, and flattening it here would
    throw away the structure the viewer's tree shows.
    """
    from build123d import Compound  # noqa: PLC0415

    objects = []
    for entry in shown:
        obj = entry["object"]
        if entry["name"] and not getattr(obj, "label", ""):
            obj.label = entry["name"]
        objects.append(obj)

    if len(objects) == 1:
        return objects[0]

    combined = Compound(children=objects)
    combined.label = "assembly"
    return combined


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
    mesher.add_shape(shape)
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
