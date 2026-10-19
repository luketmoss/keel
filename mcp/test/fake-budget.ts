import { reserveWindow } from '../src/budget.js'
import type { Env } from '../src/env'

/**
 * An in-memory stand-in for the WRITE_BUDGET Durable Object namespace: one
 * entry list per name, run through the same `reserveWindow` the real object
 * uses. What the real one adds, serialising calls, is workerd's and is checked
 * by hand against the deployed Worker. Set `clock.now` to pin the time.
 */
export function fakeBudget(clock: { now?: number } = {}) {
  const stored: Record<string, { t: number; rows: number }[]> = {}
  const namespace = {
    idFromName: (name: string) => name,
    get: (name: string) => ({
      async reserve(rows: number, now: number, limits: { maxWritesPerHour: number; maxRowsPerHour: number }) {
        const out = reserveWindow(stored[name] ?? [], clock.now ?? now, rows, limits)
        stored[name] = out.entries
        return out.allowed
          ? { allowed: true }
          : { allowed: false, reason: out.reason, limit: out.limit, resumesAt: out.resumesAt }
      },
    }),
  }
  return { namespace: namespace as unknown as Env['WRITE_BUDGET'], stored, clock }
}
