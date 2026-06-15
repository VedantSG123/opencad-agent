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
| `bun run lint` | root | ESLint across all packages |
| `bun run format` | root | Prettier write (no semicolons, single quotes, LF, 2-space) |
| `bun run format:check` | root | Prettier check only |
| `bun run package` | root | Full build then electron-builder (Linux AppImage/deb) |
| `bun run dev` | backend/ | Run backend with `--watch` |
| `bun run build` | backend/ | Compile backend to standalone binary (`dist/backend-api`) |
| `bun run dev` | frontend/ | Vite dev server (port 5173) |
| `bun run dev` | electron/ | TypeScript watch + Electron |
| `cd backend && bun run src/db/migrate-cli.ts` | backend/ | Run DB migrations manually (auto-run on startup) |

**IMPORTANT**: No test framework exists. `bun test` in backend prints `"Error: no test specified"`.

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
4. Agent panel sends chat → backend agent loop → LLM → tool calls (`applyDiff`, `writeScript`, `readScript`, `getApiDocumentation`)
5. Agent writes to `resources/replicad.js` → file watcher (chokidar in Electron) syncs back to editor
6. 3D viewport renders compiled output (STL/SVG mesh via Replicad or OpenSCAD)

## Code Organization

### Backend (`backend/src/`)
- `index.ts` — Entry point, migrates DB, creates Elysia app
- `routes/projects/` — Project CRUD endpoints (Elysia with Zod validation)
- `routes/providers/` — Auth routes (API key + OAuth)
- `agent/` — AI agent loop + tools (applyDiff, writeScript, readScript, getApiDocumentation)
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
- **No semicolons**, single quotes, LF line endings (enforced by Prettier)
- **React Router**: `react-router` v7 with `<Routes>` and `<Route>`

## Key Gotchas & Non-Obvious Patterns

1. **Backend is a child process of Electron** — it's spawned with `spawn()`, port is found dynamically (`findFreePort`). Frontend detects port via `window.electron.backendPort` (passed via `additionalArguments`). Without Electron, falls back to `http://localhost:3000/api`.

2. **Workspace sandbox** — Electron validates all filesystem paths against `allowedWorkspaceRoots` (loaded from project directories). Any path outside is rejected with `ACCESS_DENIED`. Mutations to this set happen via `dialog:open` or `projects:add-root`.

3. **File sync is Electron-only** — The `useFileSyncWS` hook returns `status: 'error'` when not in Electron. The `FileSync` component handles reload-on-change via chokidar events forwarded through IPC.

4. **Kernel files store** — `kernelFilesStore` (vanilla zustand) is the single source of truth for unsaved editor content. Both CAD kernels read from it directly, bypassing the filesystem. Updated on every Monaco keystroke.

5. **CAD web workers use comlink** — Both `replicad` and `openscad` workers are wrapped via `comlink` (`wrap`/`expose`). The replicad worker uses the `vm.ts` sandbox + OCC initialization. The OpenSCAD worker wraps the WASM-based OpenSCAD compiler.

6. **OpenSCAD WASM + libraries** — The OpenSCAD WASM build and library zips are managed by a Vite plugin (`openscad-plugin.ts`). Libraries (BOSL, BOSL2, etc.) are downloaded from GitHub, zipped, and served from `public/libraries/`. Config at `openscad-libs-config.json`. This only runs during the Vite build phase.

7. **Replicad types workaround** — A custom Vite plugin (`replicadTypesPlugin`) reads `replicad.d.ts` from node_modules and exposes it as a virtual module (`virtual:replicad-types`) because replicad's package.json `exports` field blocks deep imports.

8. **Agent tools target `resources/replicad.js`** — The backend's `readScript`/`writeScript` tools operate on a specific file at `backend/resources/replicad.js` (defined by `SCRIPT_PATH`). This is the actual script the agent edits. The Electron file watcher then syncs changes back to the frontend editor.

9. **`applyDiff` tool has aggressive fuzziness** — It extracts text from line-numbered content (when LLMs generate line numbers), strips numbering aggressively if first attempt fails, uses fuzzy matching with a configurable threshold, and tracks `lineShift` across multiple diff blocks. It also supports escaped markers that get unescaped before comparison.

10. **Provider discovery** — Three-pass detection: (1) env vars, (2) stored auth config (API keys), (3) OAuth tokens. Cached in a singleton `providerCache`.

11. **`inSeries` utility** — Used in both `useReplicad` and `useOpenSCAD` stores to serialize concurrent build calls and prevent race conditions.

12. **No tests anywhere** — The backend's `test` script is a placeholder. There are no Jest/Vitest configs or test files.

13. **No CI/CD** — No GitHub Actions workflows, Dockerfiles, or CI configuration files.

14. **No `.env` files** — No `env.example` either. Provider credentials expected via env vars at runtime or stored auth config.

15. **Backend binary compilation** — `bun build --compile src/index.ts --outfile dist/backend-api` produces a standalone binary. Resources (migrations) are resolved relative to `process.execPath` at runtime.

16. **Single-format `bun run format`** — Must be run from root. Applies to all three packages. Prettier config at root `.prettierrc`.
