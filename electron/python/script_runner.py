"""Running a user's build123d script, shared by the entry points that do it.

Both `runner.py` and `exporter.py` start the same way - execute the script with
`show` injected and collect what it showed - and differ only in what they then
do with the result. Keeping that half here means the two cannot drift on which
scripts they accept.
"""

import contextlib
import importlib.abc
import importlib.machinery
import importlib.util
import io
import json
import linecache
import os
import sys
import time
import traceback


def _absolute(path):
    return os.path.normcase(os.path.abspath(path))


class _ProjectSourceLoader(importlib.machinery.SourceFileLoader):
    def __init__(self, name, path, overrides):
        super().__init__(name, path)
        self.overrides = overrides

    def get_source(self, fullname):
        path = _absolute(self.path)
        if path in self.overrides:
            return self.overrides[path]
        return super().get_source(fullname)

    def get_code(self, fullname):
        source = self.get_source(fullname)
        linecache.cache[self.path] = (
            len(source), None, source.splitlines(keepends=True), self.path
        )
        # Timestamp-based .pyc files can still match a same-sized edit saved in
        # the same second. Project code must always come from the current source.
        return compile(source, self.path, "exec", dont_inherit=True)


class _ProjectSources(importlib.abc.MetaPathFinder):
    def __init__(self, overrides, roots):
        self.overrides = overrides
        self.roots = [_absolute(root) for root in roots]
        self.directories = set()
        for filename in overrides:
            directory = os.path.dirname(filename)
            while directory not in self.directories:
                self.directories.add(directory)
                parent = os.path.dirname(directory)
                if parent == directory:
                    break
                directory = parent

    def _project_source(self, path):
        path = _absolute(path)
        return path in self.overrides or any(
            path.startswith(root + os.sep) for root in self.roots
        )

    def _spec(self, fullname, filename, package=False):
        return importlib.util.spec_from_file_location(
            fullname,
            filename,
            loader=_ProjectSourceLoader(fullname, filename, self.overrides),
            submodule_search_locations=[os.path.dirname(filename)] if package else None,
        )

    def find_spec(self, fullname, path=None, target=None):
        name = fullname.rsplit(".", 1)[-1]
        namespaces = []
        for entry in sys.path if path is None else path:
            if not isinstance(entry, str):
                continue
            directory = _absolute(entry)
            package = os.path.join(directory, name)
            initializer = os.path.join(package, "__init__.py")
            module = os.path.join(directory, name + ".py")

            if initializer in self.overrides:
                return self._spec(fullname, initializer, package=True)

            spec = importlib.machinery.PathFinder.find_spec(fullname, [entry])
            if spec is not None and spec.loader is not None:
                if (
                    isinstance(spec.loader, importlib.machinery.SourceFileLoader)
                    and self._project_source(spec.origin)
                ):
                    spec.loader = _ProjectSourceLoader(fullname, spec.origin, self.overrides)
                return spec

            if module in self.overrides:
                return self._spec(fullname, module)

            if spec is not None:
                namespaces.extend(spec.submodule_search_locations or [])
            if package in self.directories and package not in namespaces:
                namespaces.append(package)

        if namespaces:
            spec = importlib.machinery.ModuleSpec(fullname, loader=None, is_package=True)
            spec.submodule_search_locations = namespaces
            return spec
        return None


def read_request():
    return json.load(sys.stdin)


def _read_overrides(manifest):
    if not manifest:
        return {}
    with open(manifest, "r", encoding="utf-8") as handle:
        values = json.load(handle)
    if not isinstance(values, dict) or any(
        not isinstance(path, str)
        or not os.path.isabs(path)
        or not isinstance(source, str)
        for path, source in values.items()
    ):
        raise ValueError("The Python source overrides must map absolute paths to source strings.")
    return {_absolute(path): source for path, source in values.items()}


def run_script(request):
    """Execute the requested script and return what it showed, in order."""
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

    path = os.path.abspath(request["script"])
    overrides = _read_overrides(request["overridesPath"])
    loader = _ProjectSourceLoader("__main__", path, overrides)

    # `__name__` is "__main__" so that a script guarding its body on it still
    # runs, and the script's directory leads sys.path so sibling modules import.
    script_globals = {
        "__name__": "__main__",
        "__file__": path,
        "__builtins__": __builtins__,
        "show": show,
        "show_object": show_object,
    }
    search_paths = [entry for entry in request["sysPath"] if entry]
    search_paths.insert(0, os.path.dirname(path))
    finder = _ProjectSources(overrides, [os.getcwd(), *search_paths])
    original_path = sys.path[:]
    position = sys.meta_path.index(importlib.machinery.PathFinder)
    sys.meta_path.insert(position, finder)
    sys.path[:0] = search_paths
    try:
        exec(loader.get_code("__main__"), script_globals)  # noqa: S102
    finally:
        sys.path[:] = original_path
        sys.meta_path.remove(finder)
    return shown


def execute(request, produce):
    """Run the requested script, hand what it showed to `produce`, and report the result.

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
            # The process may have been started before the project was known.
            os.chdir(request["cwd"])
            shown = run_script(request)

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


def exit_without_finalizing(status):
    """End the process once the payload is out.

    Finalizing the interpreter tears down OCCT, scipy and scikit-learn, which
    takes about 0.3 s after the result has already been written. Nothing an
    entry point leaves behind needs a finalizer, so the streams are flushed and
    the process ends without one.
    """
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(status)
