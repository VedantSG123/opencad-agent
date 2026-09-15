import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'

import { runAgent } from '../agent/loop'
import type { ModelRef } from '../agent/model'
import {
  formatModelRef,
  listConnectedModels,
  parseModelRef,
} from '../agent/model'
import type { PermissionRequest, PermissionScope } from '../agent/permissions'
import { loadSessionMessages } from '../agent/session/history'
import { shutdownPowerShellParsers } from '../agent/tools/shell/parse/powershell'
import { umzug } from '../db/migrate'
import type { Project } from '../project/schema'
import type { Session } from '../session/schema'
import { getAllProjects, getProjectById } from '../utils/dbUtils/projects'
import { createSession, getSessionById } from '../utils/dbUtils/sessions'
import { createRenderer, style } from './render'

const USAGE = `Usage: bun run src/cli/agent.ts [options]

  --project <id>   Project to work in. Omit to pick from a list.
  --session <id>   Session to resume. Omit to start a new one.
  --model  <ref>   Model as <provider>/<model>, e.g. anthropic/claude-sonnet-4-5.
                   Falls back to $OPENCAD_MODEL, then to a prompt.
  --help           Show this.`

const SCOPE_KEYS: Record<string, PermissionScope> = {
  o: 'once',
  s: 'session',
  p: 'project',
}

const terminal = createInterface({
  input: process.stdin,
  output: process.stdout,
})

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      project: { type: 'string' },
      session: { type: 'string' },
      model: { type: 'string' },
      help: { type: 'boolean' },
    },
  })

  if (values.help) {
    console.log(USAGE)
    return
  }

  await umzug.up()

  const project = await chooseProject(values.project)
  const model = await chooseModel(values.model ?? process.env.OPENCAD_MODEL)
  const session = openSession(project, values.session)

  const priorMessages = loadSessionMessages(session.id).length
  console.log(
    [
      `${style.bold(project.name)} ${style.dim(project.directory)}`,
      `${style.dim('session')} ${session.id}${priorMessages > 0 ? style.dim(` (${priorMessages} messages)`) : ''}`,
      `${style.dim('model')}   ${formatModelRef(model)}`,
      style.dim(
        'Ctrl-C interrupts a running turn. Blank line or Ctrl-D exits.',
      ),
    ].join('\n') + '\n',
  )

  await repl({ project, session, model })
}

async function repl(context: {
  project: Project
  session: Session
  model: ModelRef
}): Promise<void> {
  let running: AbortController | null = null

  // Ctrl-C stops the turn, not the process: a long shell command or a model
  // that has lost the thread should not cost the session. A second one, with
  // nothing to stop, exits.
  const interrupt = () => {
    if (!running) {
      console.log(style.dim('\nbye'))
      exit()
      return
    }
    running.abort()
    running = null
    console.log(style.yellow('\ninterrupted'))
  }

  // Both, and it has to be both. While readline holds a TTY it takes Ctrl-C
  // for itself and emits `SIGINT` on the interface instead of letting the
  // process signal fire - so a `process` listener alone never runs. Once the
  // interface is closed the process listener is the only one left.
  terminal.on('SIGINT', interrupt)
  process.on('SIGINT', interrupt)

  for (;;) {
    const prompt = (await ask(style.cyan('> ')))?.trim()
    if (!prompt) break

    running = new AbortController()
    const renderer = createRenderer()

    try {
      const result = await runAgent({
        ...context,
        prompt,
        abortSignal: running.signal,
        onEvent: renderer.onEvent,
        onPermissionRequest: askPermission,
      })
      renderer.breakLine()
      console.log(
        style.dim(
          `[${result.steps} step${result.steps === 1 ? '' : 's'} - ${result.usage.inputTokens ?? 0} in / ${result.usage.outputTokens ?? 0} out${result.aborted ? ' - interrupted' : ''}]\n`,
        ),
      )
    } catch (error) {
      renderer.breakLine()
      console.error('Error in execution')
      console.error(JSON.stringify(error, null, 2))
      console.log()
    } finally {
      running = null
    }
  }
}

/**
 * The question the policy layer could not settle. Only the scopes it offered
 * are on the menu - a command that cannot be generalised safely has no
 * "always allow" to press.
 */
async function askPermission(
  request: PermissionRequest,
  _toolCallId: string,
): Promise<PermissionScope | null> {
  const offered = request.choices.filter((choice) =>
    Object.values(SCOPE_KEYS).includes(choice.scope),
  )

  console.log(`\n  ${style.yellow(request.title)}`)
  console.log(`  ${style.bold(request.subject)}`)
  if (request.explanation) console.log(`  ${style.dim(request.explanation)}`)
  for (const choice of offered) {
    console.log(`    ${style.cyan(keyFor(choice.scope))}  ${choice.label}`)
  }
  console.log(`    ${style.cyan('d')}  Deny`)

  for (;;) {
    const answer = (await ask('  > '))?.trim().toLowerCase()
    if (answer === undefined || answer === 'd' || answer === '') return null

    const scope = SCOPE_KEYS[answer]
    if (scope && offered.some((choice) => choice.scope === scope)) return scope

    console.log(style.dim('  Pick one of the letters above.'))
  }
}

/**
 * `null` once stdin is gone - Ctrl-D, or a piped script that ran out of lines.
 * readline rejects a pending question when its input closes, and that is an
 * ordinary way for the CLI to end, not a failure worth printing.
 */
async function ask(query: string): Promise<string | null> {
  try {
    return await terminal.question(query)
  } catch {
    return null
  }
}

function keyFor(scope: PermissionScope): string {
  return (
    Object.entries(SCOPE_KEYS).find(([, value]) => value === scope)?.[0] ?? '?'
  )
}

async function chooseProject(id: string | undefined): Promise<Project> {
  if (id) {
    const project = getProjectById(id)
    if (!project) throw new Error(`No project with id "${id}".`)
    return project
  }

  const projects = getAllProjects()
  if (projects.length === 0) {
    throw new Error(
      'No projects yet. Create one in the app, or through POST /api/projects.',
    )
  }
  if (projects.length === 1) return projects[0]

  console.log('Projects:')
  projects.forEach((project, index) => {
    console.log(
      `  ${index + 1}. ${project.name} ${style.dim(project.directory)}`,
    )
  })
  return projects[await pickIndex(projects.length)]
}

async function chooseModel(ref: string | undefined): Promise<ModelRef> {
  if (ref) return parseModelRef(ref)

  const models = await listConnectedModels()
  if (models.length === 0) {
    throw new Error(
      'No connected provider offers a tool-calling model. Set an API key, or connect a provider in the app.',
    )
  }

  console.log('Models:')
  models.forEach((model, index) => {
    console.log(`  ${index + 1}. ${formatModelRef(model)}`)
  })
  return models[await pickIndex(models.length)]
}

async function pickIndex(count: number): Promise<number> {
  for (;;) {
    const answer = await terminal.question(`Pick 1-${count}: `)
    const index = Number.parseInt(answer.trim(), 10) - 1
    if (index >= 0 && index < count) return index
  }
}

function openSession(project: Project, id: string | undefined): Session {
  if (id) {
    const session = getSessionById(id)
    if (!session) throw new Error(`No session with id "${id}".`)
    if (session.project_id !== project.id) {
      throw new Error(`Session ${id} belongs to a different project.`)
    }
    return session
  }

  return createSession(project.id, `CLI ${new Date().toISOString()}`)
}

/**
 * Ends the process rather than letting the event loop drain. The PowerShell
 * parser is a live child (AGENTS.md #21), and a shell command the agent
 * started can outlive the run that asked for it - either will keep a CLI that
 * merely stopped working from ever exiting.
 */
function exit(code = 0): never {
  terminal.close()
  shutdownPowerShellParsers()
  process.exit(code)
}

try {
  await main()
} catch (error) {
  console.error(
    style.red(error instanceof Error ? error.message : String(error)),
  )
  exit(1)
}

exit(0)
