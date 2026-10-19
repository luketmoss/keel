import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeBudget } from '../test/fake-budget'
import type { Env } from './env'
import { handleHive } from './hive'
import { handleThrive } from './thrive'
import { denverStamp, describeRowChange, listCalls } from './undo-format.js'

// #412: one call id per tool call, on every write request and none on a read,
// and thrive_undo / hive_undo over the apps' own logs and undoCall actions.

const T0 = Date.UTC(2026, 9, 19, 18, 0, 0)
const env = {
  THRIVE_API_URL: 'https://script.google.com/macros/s/thrive/exec',
  THRIVE_API_KEY: 'thrive-secret-key-123',
  HIVE_API_URL: 'https://script.google.com/macros/s/hive/exec',
  HIVE_API_KEY: 'hive-secret-key-123',
  WRITE_BUDGET: fakeBudget({ now: T0 }).namespace,
} as Env

function rpc(method: string, params?: unknown): Request {
  return new Request('https://example.test/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
}
type Result = { content: { text: string }[]; isError?: boolean }
async function thrive(name: string, args: Record<string, unknown> = {}, e: Env = env) {
  const res = await handleThrive(rpc('tools/call', { name, arguments: args }), e, 'write')
  return ((await res.json()) as { result: Result }).result
}
async function hive(name: string, args: Record<string, unknown> = {}, e: Env = env) {
  const res = await handleHive(rpc('tools/call', { name, arguments: args }), e, 'write')
  return ((await res.json()) as { result: Result }).result
}

type Request_ = { action: string; payload: any; params: URLSearchParams }
function fakeApi(answer: (r: Request_) => unknown, delay?: (r: Request_) => Promise<void>) {
  const requests: Request_[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const raw = url.searchParams.get('payload')
      const r = { action: url.searchParams.get('action') ?? '', payload: raw ? JSON.parse(raw) : undefined, params: url.searchParams }
      requests.push(r)
      if (delay) await delay(r)
      const out = answer(r)
      return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200 })
    }),
  )
  return requests
}
afterEach(() => vi.unstubAllGlobals())

const LIBRARY = [{ id: 'ex_1', name: 'Bench Press', tags: '' }]

describe('one call id per tool call (#412)', () => {
  it('puts the same id on every write request of a call that needs two appendSets chunks, and none on reads', async () => {
    const requests = fakeApi((r) => {
      if (r.action === 'getExercises') return { success: true, data: LIBRARY }
      if (r.action === 'getTemplates') return { success: true, data: [] }
      return { success: true, data: {} }
    })
    // 150 sets is about 8000 encoded characters: more than one 5000-character chunk.
    const result = await thrive('thrive_schedule_week', {
      workouts: [
        { date: '2026-10-20', name: 'Big', type: 'weight', exercises: [{ exercise: 'Bench Press', section: 'primary', sets: 150, reps: '8' }] },
        { date: '2026-10-21', name: 'Two', type: 'weight', exercises: [{ exercise: 'Bench Press', section: 'primary', sets: 3, reps: '8' }] },
      ],
    })
    expect(result.isError, result.content[0].text).toBeUndefined()
    const appends = requests.filter((r) => r.action === 'appendSets')
    expect(appends.length).toBeGreaterThan(1)
    const writes = requests.filter((r) => ['appendSets', 'createWorkout'].includes(r.action))
    const ids = new Set(writes.map((w) => w.payload.call_id))
    expect(ids.size).toBe(1)
    expect([...ids][0]).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    for (const r of requests.filter((r) => r.action.startsWith('get'))) {
      expect(r.payload?.call_id, r.action).toBeUndefined()
    }
  })

  it('gives two calls different ids, and keeps each call\'s id when they interleave', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const requests = fakeApi(
      (r) => (r.action === 'createExercise' ? { success: true, data: { id: 'ex_9', name: 'x', tags: '' } } : { success: true, data: [] }),
      // Hold every createExercise until both calls have started, so their requests interleave.
      async (r) => {
        if (r.action === 'createExercise') await gate
      },
    )
    const a = thrive('thrive_create_exercise', { name: 'Alpha' })
    const b = thrive('thrive_create_exercise', { name: 'Beta' })
    await vi.waitFor(() => expect(requests.filter((r) => r.action === 'createExercise')).toHaveLength(2))
    release()
    await Promise.all([a, b])
    const [first, second] = requests.filter((r) => r.action === 'createExercise')
    expect(first.payload.call_id).toBeTruthy()
    expect(second.payload.call_id).toBeTruthy()
    expect(first.payload.call_id).not.toBe(second.payload.call_id)
    // Each id travelled with its own call's data.
    expect([first, second].map((r) => r.payload.data.name).sort()).toEqual(['Alpha', 'Beta'])
  })

  it('sends one id for a Hive write, and none for a read', async () => {
    const requests = fakeApi((r) => {
      if (r.action === 'getBoards') return { success: true, data: [{ id: 'b1', name: 'Work' }] }
      if (r.action === 'createItem') return { success: true, data: { id: 'i1', title: 't', status: 'To Do' } }
      return { success: true, data: [] }
    })
    await hive('hive_add_item', { board: 'work', title: 't' })
    const create = requests.find((r) => r.action === 'createItem')!
    expect(create.payload.call_id).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    expect(requests.find((r) => r.action === 'getBoards')!.payload).toBeUndefined()
  })
})

describe('thrive_undo (#412)', () => {
  const log = [
    { logged_at: '2026-10-19T17:50:00.000Z', call_id: 'newer', action: 'deleteWorkout', tab: 'Workouts', row_key: { id: 'w1' }, before: { id: 'w1' }, after: null },
    { logged_at: '2026-10-19T17:50:00.000Z', call_id: 'newer', action: 'deleteWorkout', tab: 'Sets', row_key: { workout_id: 'w1' }, before: {}, after: null },
    { logged_at: '2026-10-19T15:05:00.000Z', call_id: 'older', action: 'updateWorkout', tab: 'Workouts', row_key: { id: 'w2' }, before: { id: 'w2' }, after: { id: 'w2' } },
  ]

  it('lists the last calls newest first, in the stated form', async () => {
    fakeApi((r) => (r.action === 'getChangeLog' ? { success: true, data: log } : { success: true, data: [] }))
    const result = await thrive('thrive_undo')
    expect(result.content[0].text.split('\n')).toEqual([
      'newer · 2026-10-19 11:50 America/Denver · deleteWorkout · 2 rows',
      'older · 2026-10-19 09:05 America/Denver · updateWorkout · 1 rows',
    ])
  })

  it('says so when there is nothing to list', async () => {
    fakeApi(() => ({ success: true, data: [] }))
    expect((await thrive('thrive_undo')).content[0].text).toBe("No MCP writes in Thrive's change log.")
  })

  it('previews without writing, and counts nothing against the hourly budget', async () => {
    const budget = fakeBudget({ now: T0 })
    const e = { ...env, WRITE_BUDGET: budget.namespace } as Env
    const requests = fakeApi(() => ({
      success: true,
      data: {
        dry_run: true, call_id: 'newer', count: 2,
        rows: [
          { tab: 'Workouts', row_key: { id: 'w1' }, current: null, restore: { id: 'w1', name: 'Upper', date: '2026-10-18' } },
          { tab: 'Workouts', row_key: { id: 'w2' }, current: { id: 'w2', name: 'New' }, restore: { id: 'w2', name: 'Old' } },
        ],
      },
    }))
    const result = await thrive('thrive_undo', { call_id: 'newer' }, e)
    const lines = result.content[0].text.split('\n')
    expect(lines[0]).toBe('DRY RUN — nothing restored. Undoing newer would:')
    expect(lines[1]).toBe('- Workouts [id=w1]: (missing) → id="w1", name="Upper", date="2026-10-18"')
    expect(lines[2]).toBe('- Workouts [id=w2]: name: "New" → "Old"')
    expect(lines.at(-1)).toBe('Call again with confirm: true to undo.')
    expect(requests.map((r) => r.payload?.confirm)).toEqual([undefined])
    expect(requests[0].payload.call_id).toBe('newer') // the call being undone, not this call's own id
    expect(budget.stored.thrive).toBeUndefined()
    expect(result.content[0].text).not.toContain('(write) is on')
  })

  it('restores with confirm, reports the new call, and counts as one write', async () => {
    const budget = fakeBudget({ now: T0 })
    const e = { ...env, WRITE_BUDGET: budget.namespace } as Env
    const requests = fakeApi((r) =>
      r.payload.confirm
        ? { success: true, data: { dry_run: false, call_id: 'newer', undo_call_id: 'undo-1', count: 2, rows: [] } }
        : { success: true, data: { dry_run: true, call_id: 'newer', count: 2, rows: [] } },
    )
    const result = await thrive('thrive_undo', { call_id: 'newer', confirm: true }, e)
    expect(result.content[0].text.startsWith(
      'Undid newer: 2 rows restored. This undo is itself call undo-1, and can be undone the same way.',
    )).toBe(true)
    expect(result.content[0].text.endsWith("Turn it off in Search and tools when you've finished writing.")).toBe(true)
    expect(requests.filter((r) => r.payload.confirm)).toHaveLength(1)
    expect(budget.stored.thrive).toEqual([{ t: T0, rows: 2 }])
  })

  it('refuses the whole call and lists every changed row when the app reports conflicts', async () => {
    fakeApi(() => ({
      success: false,
      error: 'Nothing undone: 1 row(s) changed since call newer',
      data: {
        conflicts: [{ tab: 'Workouts', row_key: { id: 'w1' }, current: { name: 'edited' }, expected: { name: 'New' } }],
      },
    }))
    for (const confirm of [false, true]) {
      const result = await thrive('thrive_undo', { call_id: 'newer', confirm })
      expect(result.isError).toBe(true)
      expect(result.content[0].text.startsWith('Nothing undone —')).toBe(true)
      expect(result.content[0].text).toContain('- Workouts [id=w1]: now {"name":"edited"}, expected {"name":"New"}')
    }
  })

  it('passes the app\'s message on for an unknown call, as a tool error', async () => {
    fakeApi(() => ({ success: false, error: 'No MCP call nope in the change log' }))
    const result = await thrive('thrive_undo', { call_id: 'nope', confirm: true })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('No MCP call nope in the change log')
  })

  it('says an undo that failed in transit may or may not have applied, sends it once, and points at the list', async () => {
    const requests = fakeApi((r) =>
      r.payload.confirm
        ? new Response('<html>Sign in</html>', { status: 200 })
        : { success: true, data: { dry_run: true, call_id: 'newer', count: 1, rows: [] } },
    )
    const result = await thrive('thrive_undo', { call_id: 'newer', confirm: true })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('may or may not have been applied')
    expect(result.content[0].text).toContain('thrive_undo with no arguments')
    expect(requests.filter((r) => r.payload.confirm)).toHaveLength(1)
  })
})

describe('hive_undo (#412)', () => {
  const audit = [
    { timestamp: '2026-10-19T15:05:00.000Z', item_id: 'i1', action: 'created', call_id: 'older', actor: 'hive-mcp' },
    { timestamp: '2026-10-19T17:50:00.000Z', item_id: 'i2', action: 'updated', call_id: 'newer', actor: 'hive-mcp' },
    { timestamp: '2026-10-19T17:50:00.000Z', item_id: 'i2', action: 'status_changed', call_id: 'newer', actor: 'hive-mcp' },
    { timestamp: '2026-10-19T16:00:00.000Z', item_id: 'i3', action: 'updated', call_id: '', actor: 'hive-mcp' },
  ]

  it('lists the last calls from the Audit Log rows of the MCP actor, newest first', async () => {
    const requests = fakeApi(() => ({ success: true, data: audit }))
    const result = await hive('hive_undo')
    expect(result.content[0].text.split('\n')).toEqual([
      'newer · 2026-10-19 11:50 America/Denver · updated, status_changed · 2 rows',
      'older · 2026-10-19 09:05 America/Denver · created · 1 rows',
    ])
    expect(requests[0].params.get('action')).toBe('getAuditLog')
    expect(requests[0].params.get('actor')).toBe('hive-mcp')
  })

  it('says so when there is nothing to list', async () => {
    fakeApi(() => ({ success: true, data: [] }))
    expect((await hive('hive_undo')).content[0].text).toBe("No MCP writes in Hive's Audit Log.")
  })

  it('previews, then restores with confirm', async () => {
    const budget = fakeBudget({ now: T0 })
    const e = { ...env, WRITE_BUDGET: budget.namespace } as Env
    fakeApi((r) =>
      r.payload.confirm
        ? { success: true, data: { dry_run: false, call_id: 'newer', undo_call_id: 'undo-9', count: 1, changes: [] } }
        : {
            success: true,
            data: {
              dry_run: true, call_id: 'newer', count: 1,
              changes: [{ type: 'set', item_id: 'i2', title: 'Milk', field: 'title', current: 'New', restore: 'Old' }],
            },
          },
    )
    const dry = await hive('hive_undo', { call_id: 'newer' }, e)
    const lines = dry.content[0].text.split('\n')
    expect(lines[0]).toBe('DRY RUN — nothing reverted. Undoing newer would:')
    expect(lines[1]).toBe('- set "Milk" (i2): title: "New" → "Old"')
    expect(lines.at(-1)).toBe('Call again with confirm: true to undo.')
    expect(budget.stored.hive).toBeUndefined()

    const done = await hive('hive_undo', { call_id: 'newer', confirm: true }, e)
    expect(done.content[0].text.startsWith(
      'Undid newer: 1 rows restored. This undo is itself call undo-9, and can be undone the same way.',
    )).toBe(true)
    expect(budget.stored.hive).toEqual([{ t: T0, rows: 1 }])
  })

  it('refuses the whole call, naming every conflict, and passes an unknown call on as an error', async () => {
    fakeApi((r) =>
      r.payload.call_id === 'nope'
        ? { success: false, error: 'No MCP call nope in the Audit Log' }
        : {
            success: false,
            error: 'Nothing reverted: 1 conflicting field(s)',
            data: { conflicts: [{ item_id: 'i2', field: 'title', current: 'edited', expected: 'New' }] },
          },
    )
    const conflict = await hive('hive_undo', { call_id: 'newer', confirm: true })
    expect(conflict.isError).toBe(true)
    expect(conflict.content[0].text.startsWith('Nothing undone —')).toBe(true)
    expect(conflict.content[0].text).toContain('- i2 title: now "edited", expected "New"')

    const unknown = await hive('hive_undo', { call_id: 'nope', confirm: true })
    expect(unknown.isError).toBe(true)
    expect(unknown.content[0].text).toContain('No MCP call nope in the Audit Log')
  })

  it('says an undo that failed in transit may or may not have applied, and points at the list', async () => {
    const requests = fakeApi((r) =>
      r.payload.confirm
        ? new Response('<html>Sign in</html>', { status: 200 })
        : { success: true, data: { dry_run: true, call_id: 'newer', count: 1, changes: [] } },
    )
    const result = await hive('hive_undo', { call_id: 'newer', confirm: true })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('may or may not have applied')
    expect(result.content[0].text).toContain('hive_undo with no arguments')
    expect(requests.filter((r) => r.payload.confirm)).toHaveLength(1)
  })
})

describe('undo wording helpers (#412)', () => {
  it('formats Denver time on the 24-hour clock', () => {
    expect(denverStamp('2026-10-20T06:05:00.000Z')).toBe('2026-10-20 00:05')
    expect(denverStamp('2026-01-15T19:30:00.000Z')).toBe('2026-01-15 12:30')
  })

  it('lists at most 20 calls and skips rows without a call id', () => {
    const entries = Array.from({ length: 25 }, (_, i) => ({
      call_id: `c${i}`,
      at: new Date(Date.UTC(2026, 9, 19, 12, i)).toISOString(),
      action: 'a',
    }))
    entries.push({ call_id: '', at: '2026-10-20T00:00:00.000Z', action: 'legacy' })
    const lines = listCalls(entries)
    expect(lines).toHaveLength(20)
    expect(lines[0].startsWith('c24 ·')).toBe(true)
    expect(lines.join('\n')).not.toContain('legacy')
  })

  it('describes a row that appears, goes, or changes', () => {
    expect(describeRowChange({ a: '1', b: 'x' }, { a: '2', b: 'x' })).toBe('a: "1" → "2"')
    expect(describeRowChange(null, { a: '1' })).toBe('(missing) → a="1"')
    expect(describeRowChange({ a: '1' }, null)).toBe('a="1" → (removed)')
  })
})
