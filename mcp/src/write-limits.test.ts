import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeBudget } from '../test/fake-budget'
import { WINDOW_MS } from './budget.js'
import type { Env } from './env'
import { handleHive } from './hive'
import { handleThrive } from './thrive'

// #410: the per-call row ceiling and the hourly budget, through the real tools
// and the real `reserveWindow`, with a fake Durable Object namespace. That the
// real object serialises concurrent calls on workerd is checked by hand.

const T0 = Date.UTC(2026, 9, 19, 18, 0, 0) // 12:00 in Denver
const KEY = 'thrive-secret-key-123'
const URL_ = 'https://script.google.com/macros/s/thrive/exec'
const HIVE_KEY = 'hive-secret-key-123'
const HIVE_URL = 'https://script.google.com/macros/s/hive/exec'

function envWith(extra: Partial<Env> = {}) {
  const budget = fakeBudget({ now: T0 })
  const env = {
    THRIVE_API_URL: URL_,
    THRIVE_API_KEY: KEY,
    HIVE_API_URL: HIVE_URL,
    HIVE_API_KEY: HIVE_KEY,
    WRITE_BUDGET: budget.namespace,
    ...extra,
  } as Env
  return { env, ...budget }
}

function rpc(path: string, method: string, params?: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
}

type Result = { content: { text: string }[]; isError?: boolean }

async function thrive(env: Env, name: string, args: Record<string, unknown> = {}, mode: 'read' | 'write' = 'write') {
  const res = await handleThrive(rpc('/thrive/mcp', 'tools/call', { name, arguments: args }), env, mode)
  return ((await res.json()) as { result: Result }).result
}

async function hive(env: Env, name: string, args: Record<string, unknown> = {}, mode: 'read' | 'write' = 'write') {
  const res = await handleHive(rpc('/hive/mcp', 'tools/call', { name, arguments: args }), env, mode)
  return ((await res.json()) as { result: Result }).result
}

type Answer = (action: string, payload: any, url: URL) => unknown

/** A fake Apps Script API for both apps: answers by action, records every request. */
function fakeApi(answer: Answer) {
  const requests: { action: string; payload: any }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const action = url.searchParams.get('action') ?? ''
      const raw = url.searchParams.get('payload')
      const payload = raw ? JSON.parse(raw) : undefined
      requests.push({ action, payload })
      const out = answer(action, payload, url)
      return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200 })
    }),
  )
  return requests
}

afterEach(() => vi.unstubAllGlobals())

const LIBRARY = [{ id: 'ex_1', name: 'Bench Press', tags: '' }]
const writesOf = (requests: { action: string; payload?: any }[]) =>
  requests.filter((r) => !r.action.startsWith('get') && r.action !== 'previewSetUpdates')

/** `n` set rows of one exercise: n sets in one entry. */
const session = (name: string, sets: number) => ({
  date: '2026-10-20',
  name,
  type: 'weight',
  exercises: [{ exercise: 'Bench Press', section: 'primary', sets, reps: '8' }],
})

function schedulingApi() {
  return fakeApi((action) => {
    if (action === 'getExercises') return { success: true, data: LIBRARY }
    if (action === 'getTemplates') return { success: true, data: [] }
    return { success: true, data: {} }
  })
}

describe('the per-call row ceiling (#410)', () => {
  it('holds thrive_schedule_week at 201 rows: nothing written, the summary shown, confirm asked for', async () => {
    const { env, stored } = envWith()
    const requests = schedulingApi()
    // 200 set rows plus one workout row.
    const result = await thrive(env, 'thrive_schedule_week', { workouts: [session('Big', 200)] })
    expect(result.isError).toBeUndefined()
    const text = result.content[0].text
    expect(text.startsWith('CAP — nothing written. This would write 201 rows, over the 200-row limit for one call.')).toBe(true)
    expect(text).toContain('Scheduled 1 workout:')
    expect(text).toContain('200 planned sets')
    expect(text.endsWith('Call again with confirm: true to write them.')).toBe(true)
    expect(writesOf(requests)).toEqual([])
    expect(stored.thrive).toBeUndefined()
  })

  it('writes the same call with confirm: true', async () => {
    const { env, stored } = envWith()
    const requests = schedulingApi()
    const result = await thrive(env, 'thrive_schedule_week', { workouts: [session('Big', 200)], confirm: true })
    expect(result.content[0].text.startsWith('Scheduled 1 workout:')).toBe(true)
    const writes = writesOf(requests)
    expect(writes.filter((w) => w.action === 'appendSets').reduce((n, w) => n + w.payload.sets.length, 0)).toBe(200)
    expect(writes.filter((w) => w.action === 'createWorkout')).toHaveLength(1)
    // One tool call is one write against the hourly budget, however many requests it sent.
    expect(stored.thrive).toEqual([{ t: T0, rows: 201 }])
  })

  it('writes a 145-row week at once, with no confirm', async () => {
    const { env } = envWith()
    const requests = schedulingApi()
    const week = [session('A', 48), session('B', 48), session('C', 46)] // 142 sets + 3 workouts = 145
    const result = await thrive(env, 'thrive_schedule_week', { workouts: week })
    expect(result.content[0].text.startsWith('Scheduled 3 workouts:')).toBe(true)
    expect(writesOf(requests).some((w) => w.action === 'createWorkout')).toBe(true)
  })

  it('applies at exactly 200 rows, and over it for thrive_schedule_workout too', async () => {
    const { env } = envWith()
    const requests = schedulingApi()
    const ok = await thrive(env, 'thrive_schedule_workout', session('Edge', 199)) // 199 + 1 = 200
    expect(ok.content[0].text.startsWith('Scheduled **Edge**')).toBe(true)
    expect(writesOf(requests).length).toBeGreaterThan(0)

    const before = writesOf(requests).length
    const held = await thrive(env, 'thrive_schedule_workout', session('Over', 200))
    expect(held.content[0].text.startsWith('CAP — nothing written. This would write 201 rows, over the 200-row limit for one call.')).toBe(true)
    expect(held.content[0].text).toContain('Scheduled **Over**')
    expect(writesOf(requests)).toHaveLength(before)

    const confirmed = await thrive(env, 'thrive_schedule_workout', { ...session('Over', 200), confirm: true })
    expect(confirmed.content[0].text.startsWith('Scheduled **Over**')).toBe(true)
  })

  it('holds thrive_create_template over the ceiling, and a confirm at or under it changes nothing', async () => {
    const { env } = envWith()
    const requests = fakeApi((action) => {
      if (action === 'getExercises') return { success: true, data: LIBRARY }
      if (action === 'createTemplate') return { success: true, data: { id: 'tpl_1' } }
      return { success: true, data: [] }
    })
    const exercises = (n: number) =>
      Array.from({ length: n }, () => ({ exercise: 'Bench Press', section: 'primary', sets: 3, reps: '8' }))

    const held = await thrive(env, 'thrive_create_template', { name: 'Huge', exercises: exercises(201) })
    expect(held.content[0].text.startsWith('CAP — nothing written. This would write 201 rows, over the 200-row limit for one call.')).toBe(true)
    expect(held.content[0].text).toContain('Would create template **Huge**')
    expect(writesOf(requests)).toEqual([])

    const small = await thrive(env, 'thrive_create_template', { name: 'Small', exercises: exercises(5), confirm: true })
    expect(small.content[0].text).toContain('Created template **Small** (id: tpl_1)')
    const big = await thrive(env, 'thrive_create_template', { name: 'Huge', exercises: exercises(201), confirm: true })
    expect(big.content[0].text).toContain('Created template **Huge** (id: tpl_1)')
  })

  it('holds thrive_update_sets over the ceiling using the API\'s own preview, and writes with confirm', async () => {
    const { env, stored } = envWith()
    const updates = Array.from({ length: 201 }, (_, i) => ({ exercise: 'Bench Press', set_number: i + 1, reps: '5' }))
    const change = (i: number, setNumber: number) => ({
      index: i,
      exercise: { id: 'ex_1', name: 'Bench Press' },
      slot: { section: 'primary' },
      before: { workout_id: 'w1', exercise_id: 'ex_1', exercise_order: 1, set_number: setNumber },
      after: { set_number: setNumber, weight: '', reps: '5', effort: '', planned_reps: '' },
    })
    const requests = fakeApi((action, payload) => {
      if (action === 'getExercises') return { success: true, data: LIBRARY }
      if (action === 'getWorkout') return { success: true, data: { id: 'w1', name: 'Upper', type: 'weight', date: '2026-10-19' } }
      if (action === 'previewSetUpdates' || action === 'updateSets') {
        return { success: true, data: { changes: payload.updates.map((u: { set_number: number }, i: number) => change(i, u.set_number)) } }
      }
      return { success: true, data: [] }
    })

    const held = await thrive(env, 'thrive_update_sets', { workout_id: 'w1', updates })
    expect(held.isError, held.content[0].text).toBeUndefined()
    const text = held.content[0].text
    expect(text.startsWith('CAP — nothing written. This would write 201 rows, over the 200-row limit for one call.')).toBe(true)
    expect(text).toContain('Updated ')
    expect(text.endsWith('Call again with confirm: true to write them.')).toBe(true)
    expect(requests.some((r) => r.action === 'updateSets')).toBe(false)
    // The preview resolves and writes nothing, so it is not a write against the hourly budget.
    expect(stored.thrive).toBeUndefined()

    const done = await thrive(env, 'thrive_update_sets', { workout_id: 'w1', updates, confirm: true })
    expect(done.content[0].text.startsWith('CAP')).toBe(false)
    expect(requests.some((r) => r.action === 'updateSets')).toBe(true)
  })

  it('reads the ceiling from MAX_ROWS_PER_CALL', async () => {
    const { env } = envWith({ MAX_ROWS_PER_CALL: '10' })
    const requests = schedulingApi()
    const held = await thrive(env, 'thrive_schedule_workout', session('Small cap', 10))
    expect(held.content[0].text).toContain('This would write 11 rows, over the 10-row limit for one call.')
    expect(writesOf(requests)).toEqual([])
  })

  it('does not count a validation refusal or a cap hold toward the hourly budget', async () => {
    const { env, stored } = envWith()
    schedulingApi()
    const bad = await thrive(env, 'thrive_schedule_week', { workouts: [{ date: 'nonsense', name: 'x', type: 'weight', exercises: [] }] })
    expect(bad.isError).toBe(true)
    await thrive(env, 'thrive_schedule_week', { workouts: [session('Big', 300)] })
    expect(stored.thrive).toBeUndefined()
  })
})

describe('the hourly budget (#410)', () => {
  const ok = () =>
    fakeApi((action) => {
      if (action === 'createExercise') return { success: true, data: { id: 'ex_9', name: 'x', tags: '' } }
      if (action === 'getExercises') return { success: true, data: [] }
      return { success: true, data: [] }
    })

  const write = (env: Env, i: number) => thrive(env, 'thrive_create_exercise', { name: `Move ${i}` })

  it('refuses the 41st write call in an hour with the limit, the time and the reads note', async () => {
    const { env } = envWith()
    const requests = ok()
    for (let i = 1; i <= 40; i++) {
      const r = await write(env, i)
      expect(r.isError, `call ${i}: ${r.content[0].text}`).toBeUndefined()
    }
    const before = writesOf(requests).length
    const refused = await write(env, 41)
    expect(refused.isError).toBe(true)
    expect(refused.content[0].text).toBe(
      'Write limit reached for Thrive: 40 writes in the last hour. Writing resumes at 13:00 (America/Denver). Reads still work.',
    )
    expect(writesOf(requests)).toHaveLength(before)
  })

  it('refuses on 600 rows whatever the call count, naming rows', async () => {
    const { env } = envWith()
    schedulingApi()
    for (let i = 0; i < 3; i++) {
      const r = await thrive(env, 'thrive_schedule_workout', { ...session(`W${i}`, 199), confirm: true })
      expect(r.isError, r.content[0].text).toBeUndefined()
    }
    const refused = await thrive(env, 'thrive_schedule_workout', session('W4', 5))
    expect(refused.isError).toBe(true)
    expect(refused.content[0].text).toBe(
      'Write limit reached for Thrive: 600 rows in the last hour. Writing resumes at 13:00 (America/Denver). Reads still work.',
    )
  })

  it('does not let confirm: true past it', async () => {
    const { env } = envWith({ MAX_WRITES_PER_HOUR: '1' })
    const requests = fakeApi((action) => {
      if (action === 'getJournal') return { success: true, data: [{ date: '2026-09-22', note: 'Legs.' }] }
      return { success: true, data: { result: 'deleted' } }
    })
    expect((await thrive(env, 'thrive_set_journal_entry', { date: '2026-09-22', note: 'a' })).isError).toBeUndefined()
    const before = requests.length
    const refused = await thrive(env, 'thrive_set_journal_entry', { date: '2026-09-22', note: '', confirm: true })
    expect(refused.isError).toBe(true)
    expect(refused.content[0].text.startsWith('Write limit reached for Thrive: 1 writes in the last hour.')).toBe(true)
    expect(requests.filter((r) => r.action === 'upsertJournal')).toHaveLength(1)
    expect(requests.length).toBeLessThanOrEqual(before + 1) // at most the read that built the preview
  })

  it('gives each app its own budget, and never limits reads', async () => {
    const { env } = envWith({ MAX_WRITES_PER_HOUR: '1' })
    fakeApi((action, payload) => {
      if (action === 'createExercise') return { success: true, data: { id: 'ex_9', name: 'x', tags: '' } }
      if (action === 'getBoards') return { success: true, data: [{ id: 'b1', name: 'Work' }] }
      if (action === 'createItem') return { success: true, data: { id: 'i1', title: payload.data.title, status: 'To Do' } }
      return { success: true, data: [] }
    })
    expect((await write(env, 1)).isError).toBeUndefined()
    expect((await write(env, 2)).isError).toBe(true)

    // Thrive is exhausted; Hive still writes, and Thrive still reads.
    expect((await hive(env, 'hive_add_item', { board: 'work', title: 'x' })).isError).toBeUndefined()
    expect((await thrive(env, 'thrive_list_workouts', {}, 'read')).isError).toBeUndefined()
    const hiveRefused = await hive(env, 'hive_add_item', { board: 'work', title: 'y' })
    expect(hiveRefused.isError).toBe(true)
    expect(hiveRefused.content[0].text).toBe(
      'Write limit reached for Hive: 1 writes in the last hour. Writing resumes at 13:00 (America/Denver). Reads still work.',
    )
    expect((await hive(env, 'hive_list_boards', {}, 'read')).isError).toBeUndefined()
  })

  it('resumes once the window has passed', async () => {
    const { env, clock } = envWith({ MAX_WRITES_PER_HOUR: '1' })
    ok()
    expect((await write(env, 1)).isError).toBeUndefined()
    expect((await write(env, 2)).isError).toBe(true)
    clock.now = T0 + WINDOW_MS
    expect((await write(env, 3)).isError).toBeUndefined()
  })

  it('counts a write whose API call failed, but not a call stopped before sending', async () => {
    const { env, stored } = envWith()
    fakeApi((action) => {
      if (action === 'getWorkout') return { success: true, data: { id: 'w1', name: 'Upper', type: 'weight', date: '2026-09-22' } }
      if (action === 'getSets') return { success: true, data: [] }
      if (action === 'updateWorkout') return new Response('<html>Sign in</html>', { status: 200 })
      return { success: true, data: [] }
    })
    const failed = await thrive(env, 'thrive_update_workout', { workout_id: 'w1', notes: 'x' })
    expect(failed.isError).toBe(true)
    expect(stored.thrive).toHaveLength(1)

    // Refused before any request: an unknown field, then nothing to change.
    await thrive(env, 'thrive_update_workout', { workout_id: 'w1', nope: 1 })
    await thrive(env, 'thrive_update_workout', { workout_id: 'w1' })
    expect(stored.thrive).toHaveLength(1)
  })

  it('does not count previewSetUpdates, and a dry run does not either', async () => {
    const { env, stored } = envWith()
    fakeApi((action) => {
      if (action === 'getWorkout') return { success: true, data: { id: 'w1', name: 'Upper', type: 'weight', date: '2026-09-22' } }
      return { success: true, data: [] }
    })
    await thrive(env, 'thrive_delete_workout', { workout_id: 'w1' })
    expect(stored.thrive).toBeUndefined()
  })

  it('falls back to the defaults for a malformed var, never to unlimited', async () => {
    const { env } = envWith({ MAX_WRITES_PER_HOUR: 'lots' })
    const requests = ok()
    for (let i = 1; i <= 40; i++) await write(env, i)
    expect((await write(env, 41)).isError).toBe(true)
    expect(requests.filter((r) => r.action === 'createExercise')).toHaveLength(40)
  })

  it('refuses to serve a write endpoint that has no budget, and still serves the read endpoints', async () => {
    const { env } = envWith({ WRITE_BUDGET: undefined as unknown as Env['WRITE_BUDGET'] })
    const t = await handleThrive(rpc('/thrive/write/mcp', 'tools/list'), env, 'write')
    const h = await handleHive(rpc('/hive/write/mcp', 'tools/list'), env, 'write')
    expect([t.status, h.status]).toEqual([503, 503])
    const read = await handleThrive(rpc('/thrive/mcp', 'tools/list'), env, 'read')
    expect(read.status).toBe(200)
  })

  it('keeps two interleaved write calls from borrowing each other\'s state', async () => {
    const { env, stored } = envWith()
    ok()
    const [a, b] = await Promise.all([write(env, 1), write(env, 2)])
    expect([a.isError, b.isError]).toEqual([undefined, undefined])
    expect(stored.thrive).toHaveLength(2)
  })
})
