"""Build a build123d script and emit its tessellated geometry as JSON.

Invoked as `python runner.py` with one request on stdin. Running the script is
`script_runner.execute`; what is left here is turning what it showed into the
buffers the viewer draws.

Everything is imported before the request is read, so a process started ahead
of the build is already past the ~1.1 s that importing build123d costs.
"""

import base64
import json
import sys

import build123d  # noqa: F401
import numpy as np
from ocp_tessellate.convert import tessellate_group, to_ocpgroup

from script_runner import execute, exit_without_finalizing, read_request


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


def encode_inline_buffers(node):
    """Encode the buffers an edge- or vertex-only shape carries on its node.

    A Line or a Wire tessellates to no triangles, so it never reaches the
    instance list; ocp_tessellate puts its buffers straight on the tree node
    instead. Left alone they would serialise as plain JSON number lists while
    every other buffer travels base64, and the consumer would need two readers
    for the same field.
    """
    for part in node.get("parts") or []:
        encode_inline_buffers(part)

    shape = node.get("shape")
    if not isinstance(shape, dict) or "ref" in shape:
        return

    for field in FLOAT_BUFFERS:
        if shape.get(field) is not None:
            shape[field] = encode_buffer(np.asarray(shape[field], dtype=np.float32))
    for field in INDEX_BUFFERS:
        if shape.get(field) is not None:
            shape[field] = encode_buffer(np.asarray(shape[field], dtype=np.uint32))


def json_default(obj):
    """numpy scalars reach the tree through the bounding box and locations."""
    if isinstance(obj, np.generic):
        return obj.item()
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    raise TypeError(f"{type(obj)} is not JSON serializable")


def tessellate(shown, geometry_summary=False):
    group, instances = to_ocpgroup(
        *[entry["object"] for entry in shown],
        names=[entry["name"] for entry in shown],
        colors=[entry["color"] for entry in shown],
        alphas=[entry["alpha"] for entry in shown],
    )
    geometry = None
    if geometry_summary:
        from geometry_summary import summarize_geometry

        geometry = summarize_geometry(group, instances)
    meshed, shapes, _mapping = tessellate_group(group, instances, {})
    encode_inline_buffers(shapes)

    return {
        "ok": True,
        "instances": [encode_instance(instance) for instance in meshed],
        "shapes": shapes,
        **({"geometry": geometry} if geometry_summary else {}),
    }


def main():
    request = read_request()
    payload = execute(request, lambda shown: tessellate(shown, request.get("geometrySummary", False)))
    json.dump(payload, sys.stdout, default=json_default)
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    exit_without_finalizing(main())
