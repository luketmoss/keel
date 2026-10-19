import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LIMITS,
  WINDOW_MS,
  formatResume,
  limitMessage,
  parseLimits,
  reserveWindow,
} from './budget.js'
import { WriteBudget } from './budget-do'

const LIMITS = { maxWritesPerHour: 40, maxRowsPerHour: 600 }
const T0 = Date.UTC(2026, 9, 19, 18, 0, 0) // 12:00 in Denver (MDT)
const MIN = 60_000

describe('the hourly window (#410)', () => {
  it('admits writes up to the limit and refuses the next', () => {
    let entries: { t: number; rows: number }[] = []
    for (let i = 0; i < 40; i++) {
      const out = reserveWindow(entries, T0 + i * MIN, 1, LIMITS)
      expect(out.allowed, `write ${i + 1}`).toBe(true)
      entries = out.entries
    }
    const refused = reserveWindow(entries, T0 + 41 * MIN, 1, LIMITS)
    expect(refused).toMatchObject({ allowed: false, reason: 'writes', limit: 40 })
  })

  it('resumes when the oldest write leaves the window', () => {
    const entries = Array.from({ length: 40 }, (_, i) => ({ t: T0 + i * MIN, rows: 1 }))
    const refused = reserveWindow(entries, T0 + 45 * MIN, 1, LIMITS)
    expect(refused.allowed).toBe(false)
    if (!refused.allowed) expect(refused.resumesAt).toBe(T0 + WINDOW_MS)
    // At that instant the oldest entry is gone and a write is admitted.
    expect(reserveWindow(entries, T0 + WINDOW_MS, 1, LIMITS).allowed).toBe(true)
    // A minute earlier it is not.
    expect(reserveWindow(entries, T0 + WINDOW_MS - MIN, 1, LIMITS).allowed).toBe(false)
  })

  it('refuses on rows, whatever the call count, and says when enough rows have left', () => {
    const entries = [
      { t: T0, rows: 300 },
      { t: T0 + 10 * MIN, rows: 200 },
      { t: T0 + 20 * MIN, rows: 100 },
    ]
    const refused = reserveWindow(entries, T0 + 30 * MIN, 1, LIMITS)
    expect(refused).toMatchObject({ allowed: false, reason: 'rows', limit: 600 })
    // Dropping the 300-row call leaves 300 < 600.
    if (!refused.allowed) expect(refused.resumesAt).toBe(T0 + WINDOW_MS)
    expect(reserveWindow(entries, T0 + WINDOW_MS, 1, LIMITS).allowed).toBe(true)
  })

  it('checks the writes limit before the rows limit', () => {
    const entries = Array.from({ length: 40 }, (_, i) => ({ t: T0 + i, rows: 100 }))
    expect(reserveWindow(entries, T0 + MIN, 1, LIMITS)).toMatchObject({ allowed: false, reason: 'writes' })
  })

  it('admits a call that would cross the row limit, once, as long as the window is under it', () => {
    const out = reserveWindow([{ t: T0, rows: 599 }], T0 + MIN, 200, LIMITS)
    expect(out.allowed).toBe(true)
    expect(reserveWindow(out.entries, T0 + 2 * MIN, 1, LIMITS).allowed).toBe(false)
  })

  it('keeps only timestamps and counts', () => {
    const out = reserveWindow([], T0, 7, LIMITS)
    expect(out.entries).toEqual([{ t: T0, rows: 7 }])
    expect(Object.keys(out.entries[0]).sort()).toEqual(['rows', 't'])
  })

  it('drops entries older than the window', () => {
    const out = reserveWindow([{ t: T0 - WINDOW_MS, rows: 1 }, { t: T0 - WINDOW_MS + 1, rows: 1 }], T0, 1, LIMITS)
    expect(out.entries.map((e) => e.t)).toEqual([T0 - WINDOW_MS + 1, T0])
  })
})

describe('the ceilings from vars (#410)', () => {
  it('reads them, and falls back to the defaults, never to unlimited', () => {
    expect(parseLimits({ MAX_ROWS_PER_CALL: '50', MAX_WRITES_PER_HOUR: '3', MAX_ROWS_PER_HOUR: '9' })).toEqual({
      maxRowsPerCall: 50,
      maxWritesPerHour: 3,
      maxRowsPerHour: 9,
    })
    expect(parseLimits({})).toEqual(DEFAULT_LIMITS)
    for (const bad of ['', '  ', 'abc', '0', '-5', '1.5', 'Infinity', '1e999']) {
      expect(parseLimits({ MAX_ROWS_PER_CALL: bad, MAX_WRITES_PER_HOUR: bad, MAX_ROWS_PER_HOUR: bad }), bad).toEqual(
        DEFAULT_LIMITS,
      )
    }
  })
})

describe('the refusal wording (#410)', () => {
  it('names the writes, or the rows, and when writing resumes in Denver time', () => {
    expect(formatResume(T0 + WINDOW_MS)).toBe('13:00')
    expect(limitMessage('Thrive', { reason: 'writes', limit: 40, resumesAt: T0 + WINDOW_MS })).toBe(
      'Write limit reached for Thrive: 40 writes in the last hour. Writing resumes at 13:00 (America/Denver). Reads still work.',
    )
    expect(limitMessage('Hive', { reason: 'rows', limit: 600, resumesAt: T0 + WINDOW_MS })).toBe(
      'Write limit reached for Hive: 600 rows in the last hour. Writing resumes at 13:00 (America/Denver). Reads still work.',
    )
  })

  it('formats midnight as 00:00', () => {
    expect(formatResume(Date.UTC(2026, 9, 20, 6, 0, 0))).toBe('00:00') // midnight MDT
  })
})

describe('the Durable Object (#410)', () => {
  function object() {
    const store = new Map<string, unknown>()
    const ctx = {
      storage: {
        async get(key: string) {
          return store.get(key)
        },
        async put(key: string, value: unknown) {
          store.set(key, value)
        },
      },
    }
    return { store, budget: new (WriteBudget as unknown as new (ctx: unknown, env: unknown) => WriteBudget)(ctx, {}) }
  }

  it('admits, counts and refuses through its storage, holding only timestamps and counts', async () => {
    const { store, budget } = object()
    const limits = { maxWritesPerHour: 2, maxRowsPerHour: 600 }
    expect(await budget.reserve(5, T0, limits)).toEqual({ allowed: true })
    expect(await budget.reserve(1, T0 + MIN, limits)).toEqual({ allowed: true })
    expect(await budget.reserve(1, T0 + 2 * MIN, limits)).toEqual({
      allowed: false,
      reason: 'writes',
      limit: 2,
      resumesAt: T0 + WINDOW_MS,
    })
    expect(store.get('entries')).toEqual([
      { t: T0, rows: 5 },
      { t: T0 + MIN, rows: 1 },
    ])
    expect([...store.keys()]).toEqual(['entries'])
  })
})
