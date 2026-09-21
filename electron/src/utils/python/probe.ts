import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Importing build123d loads OCCT, which on a cold filesystem cache is seconds
// rather than milliseconds - and importing is the only honest check that the
// environment works, since a complete-looking directory can still fail to load.
const PROBE_TIMEOUT_MS = 60_000

const PROBE_SCRIPT = `
import json, sys
from importlib.metadata import version

try:
    import build123d, ocp_tessellate

    print(json.dumps({
        "ok": True,
        "pythonVersion": "%d.%d.%d" % sys.version_info[:3],
        "packages": {
            "build123d": version("build123d"),
            "ocp-tessellate": version("ocp-tessellate"),
        },
    }))
except Exception as exc:
    print(json.dumps({"ok": False, "reason": "%s: %s" % (type(exc).__name__, exc)}))
`

export type PythonProbe =
  | { ok: true; pythonVersion: string; packages: Record<string, string> }
  | { ok: false; reason: string }

export async function probeInterpreter(
  interpreter: string,
): Promise<PythonProbe> {
  try {
    const { stdout } = await execFileAsync(interpreter, ['-c', PROBE_SCRIPT], {
      timeout: PROBE_TIMEOUT_MS,
    })
    return JSON.parse(stdout.trim()) as PythonProbe
  } catch (error: unknown) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}
