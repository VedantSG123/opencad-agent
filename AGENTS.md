# AGENTS.md — OpenCAD Agent

## Project Overview

Three-package monorepo (Bun workspaces) for a desktop CAD application where an AI agent writes CAD scripts (Replicad or OpenSCAD), previews the 3D result, and iterates via file diffs.

- **`backend/`** — Elysia HTTP server (Bun runtime), AI SDK agent loop, SQLite persistence
- **`frontend/`** — Vite + React 19 + Three.js R3F, Monaco editor, Tailwind CSS v4
- **`electron/`** — Electron shell, spawns backend as child process, IPC filesystem bridge

## Essential Commands

| Command | Location | What it does |
|---|---|---|
| `bun run dev` | root | Starts frontend (Vite) + Electron concurrently |
| `bun run build` | root | Builds all three packages |
| `bun run lint` | root | oxlint across all packages, including type-aware rules (~10s) |
| `bun run lint:fast` | root | oxlint without type-aware rules (~0.1s) — use while iterating |
| `bun run lint:fix` | root | oxlint with autofix |
| `bun run typecheck` | root | `tsc --noEmit` across all packages (TypeScript 7) |
| `bun run format` | root | oxfmt write (no semicolons, single quotes, LF, 2-space) |
| `bun run format:check` | root | oxfmt check only |
| `bun run package` | root | Full build then electron-builder (Linux AppImage/deb) |
| `bun run dev` | backend/ | Run backend with `--watch` |
| `bun run build` | backend/ | Compile backend to standalone binary (`dist/backend-api`); runs `prebuild` first |
| `bun run prebuild` | backend/ | Stage native binaries (ripgrep) into `dist/assets/` for packaging |
| `bun run dev` | frontend/ | Vite dev server (port 5173) |
| `bun run dev` | electron/ | TypeScript watch + Electron |
| `bun test` | backend/ | Run backend tests with Bun's built-in runner |
| `cd backend && bun run src/db/migrate-cli.ts` | backend/ | Run DB migrations manually (auto-run on startup) |

**Tests**: Backend tests use Bun's built-in runner (`bun test` from `backend/`). Tool tests live in `backend/src/__tests__/agent/tools/<tool>/` and call the underlying tool function directly with a `ToolContext` pointed at sample resources in `backend/src/__tests__/resource/`.

Some tests depend on what the machine has and skip rather than fail when it is missing: the POSIX parser needs a working `bash` (see #21), the PowerShell parser and the shell tool need `pwsh`/`powershell.exe`, and the symlink tests in `read/` need permission to create links. A skipped count where you expected passes usually means one of those, not a regression.

## Architecture

```
┌──────────────────────────────────────────────────┐
│ Electron (electron/src/main.ts)                   │
│  - Spawns backend on free port                    │
│  - IPC: fs:{read,write,readdir}, dialog, watch    │
│  - Workspace sandbox (allowedWorkspaceRoots)      │
└────────┬───────────────────────────────┬──────────┘
         │ IPC (contextBridge)           │ HTTP to backend
         ▼                               ▼
┌─────────────────┐         ┌──────────────────────────┐
│ Frontend (React) │ ◄─────► │ Backend (Elysia on 127.0.0.1)│
│ - Monaco editor  │  Axios  │ - /api/projects CRUD      │
│ - R3F 3D viewport│         │ - /api/providers/auth     │
│ - CAD workers    │         │ - Agent system (AI SDK)   │
│ (Web Workers)    │         │ - SQLite (bun:sqlite)     │
└─────────────────┘         └──────────────────────────┘
```

### Data Flow
1. User opens project → frontend fetches from backend API
2. User edits code in Monaco → `kernelFilesStore` (vanilla zustand) updated on every keystroke
3. CAD kernel worker (comlink) reads from `kernelFilesStore` for compilation
4. Agent panel sends chat → backend agent loop → LLM → tool calls (`read`, `grep`, `edit`, `shell`, `getApiDocumentation`), each weighed by the permission layer first
5. Agent writes to a file under the project directory → file watcher (chokidar in Electron) syncs back to editor
6. 3D viewport renders compiled output (STL/SVG mesh via Replicad or OpenSCAD)

## Code Organization

### Backend (`backend/src/`)
- `index.ts` — Entry point, migrates DB, creates Elysia app
- `routes/projects/` — Project CRUD endpoints (Elysia with Zod validation)
- `routes/providers/` — Auth routes (API key + OAuth)
- `agent/tools/` — The tools the model may call (`read`, `grep`, `edit`, `shell`, `getApiDocumentation`)
- `agent/permissions/` — Two layers: `checkToolCall` weighs a call before it runs, `pathGuard` re-checks each path at the filesystem. Rules live in three stores (once / session / project)
- `models/` — Provider schemas, auth models, SDK configs
- `db/` — SQLite setup, migrations (umzug + BunSqliteStorage)
- `session/` — Session + message schemas (zod discriminated unions)
- `project/` — Project creation logic (init files on disk)
- `cad/` — Kernel definitions (replicad .js, openscad .scad)
- `utils/` — Logger (logixlysia), ID generator, DB utils, lazy store, dir helpers

### Frontend (`frontend/src/`)
- `main.tsx` — React root (BrowserRouter)
- `App.tsx` — Routes, providers (QueryClient, Theme, Tooltip)
- `pages/` — Route-level components (Home, Dashboard, ProjectPage, CadTest, OpenSCADTest, NotFound)
- `features/Project/` — Main workspace UI with resizable panels (editor, viewport, agent)
- `features/Dashboard/` — Project list with create/rename/delete
- `components/` — shadcn/ui components + custom (SvgViewer, ThemeToggle, tree-view)
- `hooks/` — Zustand stores + React Query hooks (useReplicad, useOpenSCAD, useProjects, etc.)
- `kernels/replicad/` — Replicad builder API with web worker (comlink)
- `kernels/openscad/` — OpenSCAD WASM wrapper with dependency resolution
- `workers/` — Web Worker entry points for both kernels
- `components-3d/` — Three.js/R3F components (Canvas, Scene, Grid, viewers for both kernels)
- `types/` — Project, Replicad, Electron API type definitions
- `contexts/` — Theme context (next-themes wrapper)
- `utils/` — Date formatting, API base URL detection
- `lib/` — Axios instance, utility functions

### Electron (`electron/src/`)
- `main.ts` — Single-instance lock, backend lifecycle, IPC handlers for fs, dialogs, workspace watch
- `preload.ts` — contextBridge exposing ElectronAPI to renderer

## Naming Conventions & Patterns

- **IDs**: Prefixed with `prj_`, `ses_`, `msg_`, `prt_` (see `generateId.ts`)
- **Route params**: Elysia `t.Object({ id: t.String() })` pattern
- **Zod schemas**: Defined as `const XSchema = z.object(...)` with `type X = z.infer<typeof XSchema>`
- **Frontend imports**: `@/` alias maps to `frontend/src/`
- **State management**: Zustand for local state (createStore vanilla, useStore React), React Query for server state
- **Mutation naming**: `useMutation({ mutationFn: ... })` with destructured mutate functions
- **React compiler**: Babel plugin enabled (`babel-plugin-react-compiler`)
- **No semicolons**, single quotes, LF line endings (enforced by oxfmt)
- **React Router**: `react-router` v7 with `<Routes>` and `<Route>`
- **Comments**: only for what the code cannot state — third-party behaviour we don't control (ripgrep flags, a package that throws on import), provider/tooling constraints, real exceptions. Never restate what a name or signature already says; if the code needs prose to be followed, fix the code. Same for JSDoc.
- **Concrete over generic**: one explicitly named function per case (`addRipgrepBinary`), not a descriptor table covering a family. Unify only once cases prove identical.

## Key Gotchas & Non-Obvious Patterns

1. **Backend is a child process of Electron** — it's spawned with `spawn()`, port is found dynamically (`findFreePort`). Frontend detects port via `window.electron.backendPort` (passed via `additionalArguments`). Without Electron, falls back to `http://localhost:3000/api`.

2. **Workspace sandbox** — Electron validates all filesystem paths against `allowedWorkspaceRoots` (loaded from project directories). Any path outside is rejected with `ACCESS_DENIED`. Mutations to this set happen via `dialog:open` or `projects:add-root`.

3. **File sync is Electron-only** — The `useFileSyncWS` hook returns `status: 'error'` when not in Electron. The `FileSync` component handles reload-on-change via chokidar events forwarded through IPC.

4. **Kernel files store** — `kernelFilesStore` (vanilla zustand) is the single source of truth for unsaved editor content. Both CAD kernels read from it directly, bypassing the filesystem. Updated on every Monaco keystroke.

5. **CAD web workers use comlink** — Both `replicad` and `openscad` workers are wrapped via `comlink` (`wrap`/`expose`). The replicad worker uses the `vm.ts` sandbox + OCC initialization. The OpenSCAD worker wraps the WASM-based OpenSCAD compiler.

6. **OpenSCAD WASM + libraries** — The OpenSCAD WASM build and library zips are managed by a Vite plugin (`openscad-plugin.ts`). Libraries (BOSL, BOSL2, etc.) are downloaded from GitHub, zipped, and served from `public/libraries/`. Config at `openscad-libs-config.json`. This only runs during the Vite build phase.

7. **Replicad types workaround** — A custom Vite plugin (`replicadTypesPlugin`) reads `replicad.d.ts` from node_modules and exposes it as a virtual module (`virtual:replicad-types`) because replicad's package.json `exports` field blocks deep imports.

8. **Every tool needs a permission descriptor** — `describeToolAccess` in `agent/permissions/request/registry.ts` returns `null` for an unregistered name, and `checkToolCall` turns that into a refusal. `createTools` is held to the same list by a `satisfies Record<ToolName, unknown>` clause, so a new tool cannot reach the model without the policy knowing what it touches. `toolset.test.ts` asserts both halves.

9. **The `edit` tool has aggressive fuzziness** — It extracts text from line-numbered content (when LLMs generate line numbers), strips numbering aggressively if first attempt fails, uses fuzzy matching with a configurable threshold, and tracks `lineShift` across multiple diff blocks. It also supports escaped markers that get unescaped before comparison.

10. **Provider discovery** — Three-pass detection: (1) env vars, (2) stored auth config (API keys), (3) OAuth tokens. Cached in a singleton `providerCache`.

11. **`inSeries` utility** — Used in both `useReplicad` and `useOpenSCAD` stores to serialize concurrent build calls and prevent race conditions.

12. **Backend tool tests** — `bun test` in `backend/` runs Bun's built-in test runner. Tests call the underlying tool functions directly (not the AI SDK `tool()` wrapper) with a `ToolContext` bound to sample files under `backend/src/__tests__/resource/`. The grep tool tests are a reference pattern for other tools.

13. **No CI/CD** — No GitHub Actions workflows, Dockerfiles, or CI configuration files.

14. **No `.env` files** — No `env.example` either. Provider credentials expected via env vars at runtime or stored auth config.

15. **Backend binary compilation** — `bun build --compile src/index.ts --outfile dist/backend-api` produces a standalone binary. Resources (migrations) are resolved relative to `process.execPath` at runtime. `isCompiled` in `backend/src/utils/runtime.ts` is the shared check for which mode is running (it matches `process.execPath` against the output binary name).

16. **Native binaries ship via `backend/dist/assets/`** — `bun build --compile` bundles JavaScript only, so anything the backend spawns as a child process (currently ripgrep, for the `grep` tool) must travel beside the binary. `backend/scripts/prebuild.ts` copies each such binary out of node_modules into `backend/dist/assets/`, and electron-builder's `extraResources` places that directory at `resources/bin/assets/`, next to `backend-api`. Two consequences: the script is named `prebuild` so **Bun's script lifecycle runs it automatically before `build`** (do not also chain it, or it runs twice), and because each provider package ships a prebuilt binary per platform/arch as an optional dependency, `bun install` on the build machine supplies only that machine's binary — **the build host must be the target host**, so cross-platform packaging needs one build per platform. At runtime, compiled mode looks *only* in `assets/`; uncompiled mode imports the path from the package. `OPENCAD_RIPGREP_PATH` overrides both.

17. **Single-format `bun run format`** — Must be run from root. Applies to all three packages. oxfmt config at root `.oxfmtrc.json`. oxfmt also sorts imports (`sortImports`), which replaces the old `simple-import-sort` ESLint rule. Coverage is wider than Prettier's old glob: JS/TS/JSX/TSX, JSON/JSONC, CSS/SCSS/Less, HTML, YAML, TOML, GraphQL and more. `*.md` and `*.yml` stay excluded via `ignorePatterns`, carried over from the old `.prettierignore`.

18. **Lint config is a single root `.oxlintrc.json`** — there are no per-workspace lint configs. oxlint discovers the root config by walking upward, so `bun run lint` from root and `cd frontend && bun run lint` both apply the same rules. Type-aware rules require the `oxlint-tsgolint` binary and dominate lint time; `bun run lint:fast` skips them.

19. **TypeScript 7 (Go compiler)** — `tsc` is the Go-native compiler. Two constraints it enforces that the old compiler did not: `baseUrl` is removed (use `paths` relative to the tsconfig), and `@types/*` packages are no longer auto-discovered, so every tsconfig must list what it needs in `types`. `electron/tsconfig.preload.json` must stay `module: commonjs`, which forces `moduleResolution: bundler` — the only pairing TS 7 accepts.

20. **Text assets are inlined at build time, not staged** — Unlike the native binaries in #16, a *text* asset the backend needs (currently `agent/tools/shell/parse/powershell.ps1`) is embedded into the bundle by a Bun macro rather than copied into `dist/assets/`. `src/utils/macro.ts` exports `inlineFile`, imported `with { type: 'macro' }`, so the read happens during `bun build` and the string is baked into the binary. Two things to know: **paths are relative to `backend/src`**, because a relative path inside a macro resolves against the build's working directory rather than the importing file, and `import.meta.dir` cannot be passed as a macro argument (arguments must be statically convertible literals) — so the macro anchors paths itself against its own `import.meta.dir`. Import attributes require `"module": "ESNext"`, which is why `backend/tsconfig.json` sets it.

21. **The shell tool parses and executes with the same shell** — `agent/tools/shell/` decides a command's policy by parsing it, then runs it. Both sides resolve the shell through `shellEnvironment.ts` (`resolveShell` / `resolveBashPath`), and they must stay that way: parsing under PowerShell 7 while executing under Windows PowerShell 5.1 would let the policy approve one reading of a command while the shell ran another. On Windows the parser is a **long-lived PowerShell child process** speaking newline-delimited JSON over stdin (commands travel as base64 UTF-16LE payloads, never concatenated into script text), which turns a ~440ms cold start into 1-4ms per check. Call `shutdownPowerShellParsers()` in a test's `afterAll` or the suite will hang on the live child. On Windows, `bash` on PATH is usually System32's WSL launcher rather than a shell — `OPENCAD_BASH_PATH` pins a real one, mirroring `OPENCAD_RIPGREP_PATH`.

22. **Command permissions are token-wise, never string prefixes** — A stored `commandHead` rule holds `string[]`, and matching compares whole tokens, so a grant for `bun add` cannot stretch to `bun adduser` and one for `bun` cannot cover `bunx` by construction. Three gates decide whether a head may be offered at all (`describeRequest.ts`): the head must be derivable (`git -C /tmp status` is not — a flag may be hiding the subcommand), it must not name a program that runs whatever it is given (`node`, `bash`, `sudo`), and it must settle *every* command in the chain, not just the one it names. Failing any gate falls back to `commandExact`, which `applyGrant` refuses to store at project scope. Anything dangerous, redirecting, substituting, or unparseable may only ever be allowed once.
