import { PythonProcess } from './process.js'

/**
 * One preview runner kept started, per window, ahead of its next build.
 *
 * Each build still gets a fresh process; the spare only means that process
 * was started, and has finished importing build123d, before the build asked.
 * A spare that is still importing is handed over anyway, since it is closer to
 * ready than a process started now.
 *
 * The replacement starts as soon as a spare is taken, alongside the build.
 * Waiting for the build to close instead spared the first build of a session
 * up to 0.3 s of two imports competing, but left the build after it waiting
 * about 0.6 s for its spare's import.
 */
export class PreviewSpares {
  private spares = new Map<number, PythonProcess>()

  constructor(private entry: () => string) {}

  take(ownerId: number, interpreter: string): PythonProcess {
    const spare = this.spares.get(ownerId)
    const usable =
      spare && spare.alive && spare.interpreter === interpreter
        ? spare
        : undefined
    if (spare && !usable) void spare.terminate()

    this.spares.set(ownerId, new PythonProcess(interpreter, this.entry()))
    return usable ?? new PythonProcess(interpreter, this.entry())
  }

  async discardOwner(ownerId: number): Promise<void> {
    const spare = this.spares.get(ownerId)
    if (!spare) return
    this.spares.delete(ownerId)
    await spare.terminate()
  }

  async discardAll(): Promise<void> {
    const spares = [...this.spares.values()]
    this.spares.clear()
    await Promise.all(spares.map((spare) => spare.terminate()))
  }
}
