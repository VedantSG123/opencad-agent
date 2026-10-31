# OpenCAD Agent

## Python development setup

After `bun install`, run this from the repository root:

```sh
bun run setup:python
```

The command stages uv, downloads Python into `.python/`, and installs build123d,
ocp-tessellate, and their dependencies into `.venv/`. Downloads are cached in
`.cache/uv/`. These directories are ignored by Git. Python and package versions
come from `shared/src/python.ts`, the same pins the application installer uses.
Run the command again after those pins change or to retry an interrupted setup.

In VS Code, install the Python and Pylance extensions. The workspace defaults to
`.venv`; if you previously selected another environment, run **Python: Select
Interpreter** and choose `.venv/bin/python` on Linux/macOS or
`.venv\Scripts\python.exe` on Windows.

Run the Python tests with:

```sh
.venv/bin/python -m unittest discover -s electron/tests/build123d -p 'test_*.py'
```

On Windows, use `.venv\Scripts\python.exe` instead.

To use this environment for CAD builds in the app, select its absolute interpreter
path in OpenCAD's Python settings. Developer setup does not change that setting.
