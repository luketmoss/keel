/* A bounded-concurrency runner for a fixed batch: at most `limit` workers
   in flight, the rest queued, each free slot picked up by the next item as
   soon as one finishes. Deliberately does not reject the whole batch when
   one worker throws — a single file's failure should never sink the
   others (#34) — so it is the *worker*'s job to catch its own errors and
   report them (e.g. into a failure list) rather than let them escape. An
   escaped throw is swallowed here rather than surfaced, since there is no
   single caller-visible promise per item to reject. */
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return

  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(limit, items.length))

  async function runOne(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        await worker(items[index], index)
      } catch {
        // A worker that lets an error escape should not stop the rest of
        // the batch — see the module comment above.
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, runOne))
}
