"""Running a user's build123d script, shared by the entry points that do it.

Both `runner.py` and `exporter.py` start the same way - execute the script with
`show` injected and collect what it showed - and differ only in what they then
do with the result. Keeping that half here means the two cannot drift on which
scripts they accept.
"""

from __future__ import annotations

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
from collections.abc import Callable, Mapping, Sequence
from types import CodeType, ModuleType
from typing import TYPE_CHECKING, Never

from pipeline_types import (
    ExportRequest,
    ScriptRequest,
    ShownObject,
    ShowOptions,
)

if TYPE_CHECKING:
    from ocp_tessellate.types import ColorLike


def _absolute(path: str) -> str:
    return os.path.normcase(os.path.abspath(path))


class _ProjectSourceLoader(importlib.machinery.SourceFileLoader):
    def __init__(self, name: str, path: str, overrides: dict[str, str]) -> None:
        super().__init__(name, path)
        self.overrides = overrides

    def get_source(self, fullname: str) -> str:
        path = _absolute(self.path)
        if path in self.overrides:
            return self.overrides[path]
        source = super().get_source(fullname)
        if source is None:
            raise ImportError(
                f'No Python source available for {fullname}',
                name=fullname,
                path=self.path,
            )
        return source

    def get_code(self, fullname: str) -> CodeType:
        source = self.get_source(fullname)
        linecache.cache[self.path] = (
            len(source),
            None,
            source.splitlines(keepends=True),
            self.path,
        )
        # Timestamp-based .pyc files can still match a same-sized edit saved in
        # the same second. Project code must always come from the current source.
        return compile(source, self.path, 'exec', dont_inherit=True)


class _ProjectSources(importlib.abc.MetaPathFinder):
    def __init__(self, overrides: dict[str, str], roots: Sequence[str]) -> None:
        self.overrides = overrides
        self.roots = [_absolute(root) for root in roots]
        self.directories: set[str] = set()
        for filename in overrides:
            directory = os.path.dirname(filename)
            while directory not in self.directories:
                self.directories.add(directory)
                parent = os.path.dirname(directory)
                if parent == directory:
                    break
                directory = parent

    def _project_source(self, path: str) -> bool:
        path = _absolute(path)
        return path in self.overrides or any(
            path.startswith(root + os.sep) for root in self.roots
        )

    def _spec(
        self, fullname: str, filename: str, package: bool = False
    ) -> importlib.machinery.ModuleSpec:
        spec = importlib.util.spec_from_file_location(
            fullname,
            filename,
            loader=_ProjectSourceLoader(fullname, filename, self.overrides),
            submodule_search_locations=[os.path.dirname(filename)]
            if package
            else None,
        )
        if spec is None:
            raise ImportError(f'Cannot load Python module {fullname}')
        return spec

    def find_spec(
        self,
        fullname: str,
        path: Sequence[str] | None = None,
        target: ModuleType | None = None,
    ) -> importlib.machinery.ModuleSpec | None:
        name = fullname.rsplit('.', 1)[-1]
        namespaces: list[str] = []
        for entry in sys.path if path is None else path:
            if not isinstance(entry, str):
                continue
            directory = _absolute(entry)
            package = os.path.join(directory, name)
            initializer = os.path.join(package, '__init__.py')
            module = os.path.join(directory, name + '.py')

            if initializer in self.overrides:
                return self._spec(fullname, initializer, package=True)

            spec = importlib.machinery.PathFinder.find_spec(fullname, [entry])
            if spec is not None and spec.loader is not None:
                origin = spec.origin
                if (
                    isinstance(
                        spec.loader, importlib.machinery.SourceFileLoader
                    )
                    and origin is not None
                    and self._project_source(origin)
                ):
                    spec.loader = _ProjectSourceLoader(
                        fullname, origin, self.overrides
                    )
                return spec

            if module in self.overrides:
                return self._spec(fullname, module)

            if spec is not None:
                namespaces.extend(spec.submodule_search_locations or [])
            if package in self.directories and package not in namespaces:
                namespaces.append(package)

        if namespaces:
            spec = importlib.machinery.ModuleSpec(
                fullname, loader=None, is_package=True
            )
            spec.submodule_search_locations = namespaces
            return spec
        return None


def read_request() -> ScriptRequest | ExportRequest:
    value: object = json.load(sys.stdin)
    if not isinstance(value, dict):
        raise ValueError('The Python request must be an object.')
    script = value.get('script')
    cwd = value.get('cwd')
    search_paths = value.get('sysPath')
    overrides = value.get('overridesPath')
    if not isinstance(script, str) or not isinstance(cwd, str):
        raise ValueError('script and cwd must be strings.')
    if not isinstance(search_paths, list):
        raise ValueError('sysPath must be a list of strings.')
    paths: list[str] = []
    for entry in search_paths:
        if not isinstance(entry, str):
            raise ValueError('sysPath must be a list of strings.')
        paths.append(entry)
    if overrides is not None and not isinstance(overrides, str):
        raise ValueError('overridesPath must be a string or null.')
    request: ScriptRequest = {
        'script': script,
        'cwd': cwd,
        'sysPath': paths,
        'overridesPath': overrides,
    }
    if 'geometrySummary' in value:
        summary = value['geometrySummary']
        if not isinstance(summary, bool):
            raise ValueError('geometrySummary must be a boolean.')
        request['geometrySummary'] = summary
    if 'format' in value or 'output' in value:
        fmt, output = value.get('format'), value.get('output')
        if not isinstance(fmt, str) or not isinstance(output, str):
            raise ValueError('format and output must be strings.')
        return ExportRequest(**request, format=fmt, output=output)
    return request


def _read_overrides(manifest: str | None) -> dict[str, str]:
    if not manifest:
        return {}
    with open(manifest, 'r', encoding='utf-8') as handle:
        values: object = json.load(handle)
    if not isinstance(values, dict):
        raise ValueError(
            'The Python source overrides must map absolute paths to source strings.'
        )
    overrides: dict[str, str] = {}
    for path, source in values.items():
        if (
            not isinstance(path, str)
            or not os.path.isabs(path)
            or not isinstance(source, str)
        ):
            raise ValueError(
                'The Python source overrides must map absolute paths to source strings.'
            )
        overrides[_absolute(path)] = source
    return overrides


def run_script(request: ScriptRequest) -> list[ShownObject]:
    shown: list[ShownObject] = []

    def show(
        *objects: object,
        names: Sequence[str | None] | None = None,
        colors: Sequence[ColorLike | None] | None = None,
        alphas: Sequence[float | None] | None = None,
        **_ignored: object,
    ) -> None:
        for index, obj in enumerate(objects):
            shown.append(
                {
                    'object': obj,
                    'name': names[index]
                    if names and index < len(names)
                    else None,
                    'color': colors[index]
                    if colors and index < len(colors)
                    else None,
                    'alpha': alphas[index]
                    if alphas and index < len(alphas)
                    else None,
                }
            )

    def show_object(
        obj: object,
        name: str | None = None,
        options: ShowOptions | None = None,
        **_ignored: object,
    ) -> None:
        shown.append(
            {
                'object': obj,
                'name': name,
                'color': (options or {}).get('color'),
                'alpha': (options or {}).get('alpha'),
            }
        )

    path = os.path.abspath(request['script'])
    overrides = _read_overrides(request['overridesPath'])
    loader = _ProjectSourceLoader('__main__', path, overrides)

    # `__name__` is "__main__" so that a script guarding its body on it still
    # runs, and the script's directory leads sys.path so sibling modules import.
    script_globals: dict[str, object] = {
        '__name__': '__main__',
        '__file__': path,
        '__builtins__': __builtins__,
        'show': show,
        'show_object': show_object,
    }
    search_paths = [entry for entry in request['sysPath'] if entry]
    search_paths.insert(0, os.path.dirname(path))
    finder = _ProjectSources(overrides, [os.getcwd(), *search_paths])
    original_path = sys.path[:]
    position = sys.meta_path.index(importlib.machinery.PathFinder)
    sys.meta_path.insert(position, finder)
    sys.path[:0] = search_paths
    try:
        exec(loader.get_code('__main__'), script_globals)
    finally:
        sys.path[:] = original_path
        sys.meta_path.remove(finder)
    return shown


def execute(
    request: ScriptRequest,
    produce: Callable[[list[ShownObject]], Mapping[str, object]],
) -> dict[str, object]:
    """Run the requested script, hand what it showed to `produce`, and report the result.

    The script's own `print` output is captured rather than allowed through,
    because anything it wrote would land in the middle of the payload; it comes
    back as `logs` instead. A script that raises is still a successful *run* -
    the payload says `ok: false` and carries the traceback, so a non-zero exit
    means this module itself broke.
    """
    started = time.perf_counter()
    captured = io.StringIO()
    payload: dict[str, object]

    try:
        with (
            contextlib.redirect_stdout(captured),
            contextlib.redirect_stderr(captured),
        ):
            # The process may have been started before the project was known.
            os.chdir(request['cwd'])
            shown = run_script(request)

            if not shown:
                payload = {
                    'ok': False,
                    'error': 'The script finished without calling show().',
                }
            else:
                payload = dict(produce(shown))
    except BaseException as error:
        payload = {'ok': False, 'error': traceback.format_exc()}
        if isinstance(error, SyntaxError):
            filename, line, column = error.filename, error.lineno, error.offset
        else:
            frames = traceback.extract_tb(error.__traceback__)
            frame = frames[-1] if frames else None
            filename, line, column = (
                (frame.filename, frame.lineno, None)
                if frame
                else (None, None, None)
            )
        if (
            filename
            and line
            and _absolute(filename) == _absolute(request['script'])
        ):
            location: dict[str, str | int] = {
                'file': os.path.abspath(filename),
                'line': line,
            }
            if column and column > 0:
                location['column'] = column
            payload['location'] = location

    payload['logs'] = captured.getvalue()
    payload['duration'] = round(time.perf_counter() - started, 3)
    return payload


def exit_without_finalizing(status: int) -> Never:
    """End the process once the payload is out.

    Finalizing the interpreter tears down OCCT, scipy and scikit-learn, which
    takes about 0.3 s after the result has already been written. Nothing an
    entry point leaves behind needs a finalizer, so the streams are flushed and
    the process ends without one.
    """
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(status)
