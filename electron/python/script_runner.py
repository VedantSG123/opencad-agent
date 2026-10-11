"""Running a user's build123d script, shared by the entry points that do it.

Both `runner.py` and `exporter.py` start the same way - execute the script with
`show` injected and collect what it showed - and differ only in what they then
do with the result. Keeping that half here means the two cannot drift on which
scripts they accept.
"""

import contextlib
import io
import os
import sys
import time
import traceback


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
    # The script's own directory goes on first so that the host's entries end
    # up ahead of it: the shadow directory holding unsaved buffers has to lead,
    # or an edited module loses to the copy still on disk.
    sys.path.insert(0, os.path.dirname(os.path.abspath(path)))
    for entry in reversed(os.environ.get("OPENCAD_SYS_PATH", "").split(os.pathsep)):
        if entry:
            sys.path.insert(0, entry)

    exec(compile(source, path, "exec"), script_globals)  # noqa: S102
    return shown


def execute(path, produce):
    """Run the script, hand what it showed to `produce`, and report the result.

    The script's own `print` output is captured rather than allowed through,
    because anything it wrote would land in the middle of the payload; it comes
    back as `logs` instead. A script that raises is still a successful *run* -
    the payload says `ok: false` and carries the traceback, so a non-zero exit
    means this module itself broke.
    """
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
                payload = produce(shown)
    except BaseException:  # noqa: BLE001
        payload = {"ok": False, "error": traceback.format_exc()}

    payload["logs"] = captured.getvalue()
    payload["duration"] = round(time.perf_counter() - started, 3)
    return payload
