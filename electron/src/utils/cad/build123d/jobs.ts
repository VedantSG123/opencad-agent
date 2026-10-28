import type { Build123dRunIdentity } from 'shared/build123d'

import { AppError } from '../../ipc-utils.js'

export type RunIdentity = Build123dRunIdentity & {
  ownerId: number
}

export class Build123dRuns {
  private jobs = new Set<{
    identity: RunIdentity
    kind: 'preview' | 'export'
    controller: AbortController
    finished: Promise<unknown>
  }>()

  async run<T>(
    identity: RunIdentity,
    kind: 'preview' | 'export',
    execute: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    for (const job of this.jobs) {
      if (
        job.identity.ownerId === identity.ownerId &&
        job.identity.sessionId === identity.sessionId
      ) {
        if (job.identity.runId === identity.runId) {
          throw new AppError('INVALID_INPUT', 'This build run already exists.')
        }
        if (kind === 'preview' && job.kind === 'preview') {
          job.controller.abort(
            new AppError(
              'BUILD_CANCELLED',
              'A newer preview replaced this build.',
            ),
          )
        }
      }
    }
    const controller = new AbortController()
    const finished = Promise.resolve().then(async (): Promise<T> => {
      try {
        controller.signal.throwIfAborted()
        const result = await execute(controller.signal)
        controller.signal.throwIfAborted()
        return result
      } finally {
        this.jobs.delete(job)
      }
    })
    const job = { identity, kind, controller, finished }
    this.jobs.add(job)
    return finished
  }

  cancel(request: Omit<RunIdentity, 'runId'> & { runId?: string }): boolean {
    let cancelled = false
    for (const job of this.jobs) {
      if (
        job.identity.ownerId === request.ownerId &&
        job.identity.sessionId === request.sessionId &&
        (request.runId === undefined || job.identity.runId === request.runId) &&
        !job.controller.signal.aborted
      ) {
        job.controller.abort(
          new AppError('BUILD_CANCELLED', 'The build was cancelled.'),
        )
        cancelled = true
      }
    }
    return cancelled
  }

  cancelOwner(ownerId: number): void {
    for (const job of this.jobs) {
      if (job.identity.ownerId === ownerId) {
        this.cancel({ ownerId, sessionId: job.identity.sessionId })
      }
    }
  }

  async cancelAll(): Promise<void> {
    const finished = [...this.jobs].map((job) => job.finished)
    for (const job of this.jobs) this.cancelOwner(job.identity.ownerId)
    await Promise.allSettled(finished)
  }
}
