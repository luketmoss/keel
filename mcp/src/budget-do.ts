import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'
import { parseLimits, reserveWindow } from './budget.js'

type Entry = { t: number; rows: number }
type Limits = { maxWritesPerHour: number; maxRowsPerHour: number }
export type Verdict =
  | { allowed: true }
  | { allowed: false; reason: 'writes' | 'rows'; limit: number; resumesAt: number }

/**
 * The hourly write counter (#410), one per app. It holds timestamps and row
 * counts and nothing else: never an argument, a value or a name.
 *
 * A Durable Object rather than KV because KV is eventually consistent and takes
 * one write per second per key, so a fast loop would slip past the count. Here
 * the read and the write of `entries` cannot interleave with another call: the
 * object's input gate holds other events while a storage operation is pending.
 */
export class WriteBudget extends DurableObject<Env> {
  async reserve(rows: number, now: number, limits: Limits): Promise<Verdict> {
    const entries = (await this.ctx.storage.get<Entry[]>('entries')) ?? []
    const out = reserveWindow(entries, now, rows, limits)
    await this.ctx.storage.put('entries', out.entries)
    if (out.allowed) return { allowed: true }
    return { allowed: false, reason: out.reason, limit: out.limit, resumesAt: out.resumesAt }
  }
}

/**
 * The budget and ceilings for one app on this request. One counter per app, so
 * exhausting Thrive's leaves Hive writing, and the reverse.
 */
export function budgetFor(env: Env, app: 'thrive' | 'hive') {
  const stub = env.WRITE_BUDGET.get(env.WRITE_BUDGET.idFromName(app))
  const limits = parseLimits(env)
  return { limits, budget: { reserve: (rows: number) => stub.reserve(rows, Date.now(), limits) } }
}
