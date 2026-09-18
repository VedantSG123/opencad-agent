"""Build a build123d script and emit its tessellated geometry as JSON.

Invoked as `python runner.py <script>`. The script is executed with `show` and
`show_object` injected, and whatever it shows is tessellated by ocp_tessellate
and written to stdout.

Two things about stdout are deliberate. The script's own `print` output is
captured rather than allowed through, because anything it wrote would land in
the middle of the payload; it comes back as `logs` instead. And a script that
raises is still a successful *run* - the JSON says `ok: false` and carries the
traceback, so a non-zero exit means the runner itself broke.
"""

import base64
import contextlib
import io
import json
import os
import sys
import time
import traceback


def encode_buffer(array):
    """A numpy array as base64, in the shape the viewer decodes."""
    contiguous = array if array.flags["C_CONTIGUOUS"] else array.copy()
    return {
        "shape": list(contiguous.shape),
        "dtype": str(contiguous.dtype),
        "buffer": base64.b64encode(contiguous.tobytes()).decode("ascii"),
        "codec": "b64",
    }


# The dtype each buffer is cast to before encoding, so that the consumer can
# read it without inspecting anything. ocp_tessellate happens to emit float32
# and int32 today, but nothing in its contract says so, and a buffer that
# arrived as float64 would be read as garbage rather than rejected.
#
# `uvs` is only present when a material asked for it, so every field is looked
# up rather than required.
FLOAT_BUFFERS = ("vertices", "normals", "edges", "obj_vertices", "uvs")
INDEX_BUFFERS = (
    "triangles",
    "face_types",
    "edge_types",
    "triangles_per_face",
    "segments_per_edge",
)


def encode_instance(instance):
    import numpy as np  # noqa: PLC0415

    encoded = {}
    for field in FLOAT_BUFFERS:
        value = instance.get(field)
        if value is not None:
            encoded[field] = encode_buffer(np.asarray(value, dtype=np.float32))
    for field in INDEX_BUFFERS:
        value = instance.get(field)
        if value is not None:
            encoded[field] = encode_buffer(np.asarray(value, dtype=np.uint32))
    return encoded


def json_default(obj):
    """numpy scalars reach the tree through the bounding box and locations."""
    import numpy as np  # noqa: PLC0415

    if isinstance(obj, np.generic):
        return obj.item()
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    raise TypeError(f"{type(obj)} is not JSON serializable")


def run_script(path):
    """Execute the script and return what it showed, in order."""
    shown = []

    def show(*objects, names=None, colors=None, alphas=None, **_ignored):
        for index, obj in enumerate(objects):
            shown.append(
                {
                    "object": obj,
                    "name": names[index] if names and index < len(names) else None,
                    "color": colors[index] if colors and index < len(colors) else None,
                    "alpha": alphas[index] if alphas and index < len(alphas) else None,
                }
            )

    def show_object(obj, name=None, options=None, **_ignored):
        shown.append(
            {
                "object": obj,
                "name": name,
                "color": (options or {}).get("color"),
                "alpha": (options or {}).get("alpha"),
            }
        )

    with open(path, "r", encoding="utf-8") as handle:
        source = handle.read()

    # `__name__` is "__main__" so that a script guarding its body on it still
    # runs, and the script's directory leads sys.path so sibling modules import.
    script_globals = {
        "__name__": "__main__",
        "__file__": path,
        "__builtins__": __builtins__,
        "show": show,
        "show_object": show_object,
    }
    sys.path.insert(0, os.path.dirname(os.path.abspath(path)))

    exec(compile(source, path, "exec"), script_globals)  # noqa: S102
    return shown


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "no script given"}))
        return 0

    path = sys.argv[1]
    started = time.perf_counter()
    captured = io.StringIO()

    try:
        with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
            shown = run_script(path)

            if not shown:
                payload = {
                    "ok": False,
                    "error": "The script finished without calling show().",
                }
            else:
                from ocp_tessellate.convert import (  # noqa: PLC0415
                    tessellate_group,
                    to_ocpgroup,
                )

                group, instances = to_ocpgroup(
                    *[entry["object"] for entry in shown],
                    names=[entry["name"] for entry in shown],
                    colors=[entry["color"] for entry in shown],
                    alphas=[entry["alpha"] for entry in shown],
                )
                meshed, shapes, _mapping = tessellate_group(group, instances, {})

                payload = {
                    "ok": True,
                    "instances": [encode_instance(instance) for instance in meshed],
                    "shapes": shapes,
                }
    except BaseException:  # noqa: BLE001
        payload = {"ok": False, "error": traceback.format_exc()}

    payload["logs"] = captured.getvalue()
    payload["duration"] = round(time.perf_counter() - started, 3)

    json.dump(payload, sys.stdout, default=json_default)
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
