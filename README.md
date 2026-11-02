# OpenCAD Agent

## Python development setup

After `bun install`, run this from the repository root:

```sh
bun run setup:python
```

The command stages uv, downloads Python into `.python/`, and installs build123d,
ocp-tessellate, Ruff, OCP type stubs, and their dependencies into `.venv/`.
Downloads are cached in `.cache/uv/`. These directories are ignored by Git.
Python and CAD package versions come from `shared/src/python.ts`, the same pins
the application installer uses.
Run the command again after those pins change or to retry an interrupted setup.

Ruff and `cadquery-ocp-stubs` are pinned separately in
`electron/scripts/setup-python.ts` as development dependencies. They are not
installed by the application's Python installer. Keep the OCP stubs version
aligned with the installed `cadquery-ocp-novtk` bindings.

The OCP stubs provide `.pyi` type declarations for the native CAD bindings so
Pylance and Pyright can resolve their classes and method signatures. They do not
change CAD execution.

Pyright is pinned in the root Bun development dependencies and installed by
`bun install`. It runs with Bun and checks against `.venv` using
`pyrightconfig.json`, which enables standard type checking for Python source
and tests.

Python pipeline functions use the library's `OcpGroup`, `OcpObject`, `Instance`,
and `Tessellation` types for CAD traversal and mesh buffers. Our request,
`show()`, and encoded-buffer dictionaries are defined in
`electron/python/pipeline_types.py`; measurement results are typed in
`geometry_summary.py`.

In VS Code, install the recommended Python, Pylance, and Ruff extensions. The
workspace defaults to `.venv`; if you previously selected another environment,
run **Python: Select Interpreter** and choose `.venv/bin/python` on Linux/macOS or
`.venv\Scripts\python.exe` on Windows.

Zed's project settings launch the pinned Pyright and Ruff language servers.
Python uses four-space indentation, with Ruff formatting and fixes on save.
Select `.venv` with `toolchain: select` if Zed does not select it automatically.

Ruff provides Python linting, import sorting, and formatting. The workspace uses
it to format Python on save and apply lint/import fixes on explicit saves.
Settings live in `ruff.toml`, with single quotes, LF endings, and an 80-column
formatting target.

| Command | Purpose |
| --- | --- |
| `bun run lint:python` | Run Ruff and Pyright on Python source and tests |
| `bun run lint:python:fix` | Apply safe Ruff fixes, then run Pyright |
| `bun run format:python` | Format Python source and tests |
| `bun run format:python:check` | Check Python formatting without writing |

The root `lint`, `lint:fix`, `format`, and `format:check` commands also run the
corresponding Python tools. Python linting always includes Pyright. Run
`bun run setup:python` before using them. Checks use the installed tools and do
not download packages.

Run the Python tests with:

```sh
.venv/bin/python -m unittest discover -s electron/tests/build123d -p 'test_*.py'
```

On Windows, use `.venv\Scripts\python.exe` instead.

To use this environment for CAD builds in the app, select its absolute interpreter
path in OpenCAD's Python settings. Developer setup does not change that setting.
