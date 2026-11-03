// At most one quiet refresh in flight per store (#790). A refresh asked for while one runs doesn't start another: it
// marks the store as needing one, and when the running one settles, exactly one more runs.

export interface QuietGate {
  /** Run `run` now, or, when one is out, once more after it settles. Resolves when nothing is left to run. */
  request(run: () => Promise<void>): Promise<void>;
  /** A full load started: a queued refresh is no longer wanted. */
  cancel(): void;
  /** Forget everything (tests and sign-out). */
  reset(): void;
}

export function quietGate(): QuietGate {
  let running: Promise<void> | null = null;
  let queued = false;
  let epoch = 0;
  return {
    request(run) {
      if (running) {
        queued = true;
        return running;
      }
      const mine = epoch;
      const loop = (async () => {
        try {
          do {
            queued = false;
            await run();
          } while (queued && mine === epoch);
        } finally {
          if (mine === epoch) running = null;
        }
      })();
      running = loop;
      return loop;
    },
    cancel() {
      queued = false;
    },
    reset() {
      epoch++;
      queued = false;
      running = null;
    },
  };
}
