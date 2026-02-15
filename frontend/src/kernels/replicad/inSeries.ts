/**
 * Wrap an async function so it runs in series with coalesced reruns.
 * - If invoked during an in-flight run, it flags a refresh and exits immediately.
 * - When the current run finishes, it will rerun if any calls arrived in the meantime.
 * - Loops until no new calls arrive during the last run.
 *
 * By default, each rerun uses the most recent call's arguments ("last-call wins").
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function inSeries<A extends any[], R>(
  func: (...args: A) => Promise<R>,
): (...args: A) => Promise<void> {
  let currentlyRunning = false;
  let refresh = false;
  let lastArgs: A | null = null;

  return async function (...args: A): Promise<void> {
    // Record the latest arguments for the next pass.
    lastArgs = args;

    if (currentlyRunning) {
      refresh = true;
      return;
    }

    currentlyRunning = true;

    try {
      while (true) {
        refresh = false;

        // Snapshot and clear lastArgs so new calls during func can update it.
        const runArgs = lastArgs!;
        lastArgs = null;

        await func(...runArgs);

        // If any calls arrived while running, loop again with the newest args.
        if (!refresh) break;
      }
    } finally {
      currentlyRunning = false;
    }
  };
}
