import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import { fakeBudget } from '../../test/fake-budget'
import { handleForage } from './index'
import { FORAGE_READ_TOOLS } from './tools'

// #709: the meal plan's five tools over a fake Forage API, with the wording of
// forage/docs/design/709-meal-plan.md. The API's own rules (the derived fields,
// not_on_trip, the duplicate check, planWeek) are in forage/apps-script/tests/plan.test.ts.

const KEY = 'forage-key'
const URL_ = 'https://script.google.com/macros/s/forage/exec'
// 11:00 on Monday 2 November in Denver.
const NOW = Date.UTC(2026, 10, 2, 18)
const REMINDER = "— Forage (write) is on. Turn it off in Search and tools when you've finished writing."

let budget = fakeBudget({ now: NOW })
const env = () =>
  ({ FORAGE_API_URL: URL_, FORAGE_API_KEY: KEY, WRITE_BUDGET: budget.namespace }) as Env

type Result = { content: { text: string }[]; isError?: boolean }
type Sent = { action: string; payload: any; params: URLSearchParams }

async function call(name: string, args: Record<string, unknown> = {}): Promise<Result> {
  const mode = FORAGE_READ_TOOLS.has(name) ? 'read' : 'write'
  const req = new Request('https://example.test/forage/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  })
  const res = await handleForage(req, env(), mode)
  return ((await res.json()) as { result: Result }).result
}

/** A fake API answering by action; anything unlisted is an unknown action. */
function api(answers: Record<string, (r: Sent) => unknown>) {
  const sent: Sent[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: string, init?: RequestInit) => {
      const params = new URLSearchParams(String(init?.body ?? ''))
      const raw = params.get('payload')
      const r = { action: params.get('action') ?? '', payload: raw ? JSON.parse(raw) : undefined, params }
      sent.push(r)
      const fn = answers[r.action]
      const out = fn ? fn(r) : { success: false, error: `Unknown action "${r.action}"` }
      return new Response(JSON.stringify(out), { status: 200 })
    }),
  )
  return sent
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  budget = fakeBudget({ now: NOW })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const ok = (data: unknown) => () => ({ success: true, data })

function entry(over: Record<string, unknown>) {
  return {
    id: 'pl_1',
    date: '2026-11-03',
    slot: 'Dinner',
    recipe_id: '',
    recipe_name: '',
    servings: null,
    note: '',
    kcal_serving: null,
    partial: false,
    trip_id: '',
    trip_status: '',
    on_trip: false,
    shopped: false,
    created: 'x',
    updated: 'x',
    ...over,
  }
}

const CHILI = { recipe_id: 'rc_9e8f7a6b', recipe_name: 'Weeknight chili', servings: 6, kcal_serving: 412.4 }
const STEW = { recipe_id: 'rc_stew', recipe_name: 'Beef Stew', servings: 6, kcal_serving: 388.2, partial: true }

const textOf = (r: Result) => r.content[0].text

describe('forage_list_plan', () => {
  it('lists today and the next 7 days by default, with the banner count, chips and empty days', async () => {
    const sent = api({
      getPlan: ok({
        entries: [
          entry({ id: 'pl_1a2b3c4d', date: '2026-11-02', slot: 'Lunch', note: 'Leftovers' }),
          entry({ id: 'pl_5d6e7f8a', date: '2026-11-03', ...CHILI, trip_id: 'tr_1', trip_status: 'open', on_trip: true }),
          entry({ id: 'pl_oats', date: '2026-11-03', slot: 'Breakfast', recipe_id: 'rc_oats', recipe_name: 'Oats', on_trip: true, shopped: true }),
          entry({ id: 'pl_stew', date: '2026-11-05', ...STEW }),
        ],
        not_on_trip: 3,
      }),
    })
    const r = await call('forage_list_plan')
    expect(r.isError).toBeUndefined()
    expect(sent.map((s) => [s.action, s.params.get('from'), s.params.get('to'), s.params.get('today')])).toEqual([
      ['getPlan', '2026-11-02', '2026-11-09', '2026-11-02'],
    ])
    expect(textOf(r).split('\n')).toEqual([
      "Plan Mon 2026-11-02 to Mon 2026-11-09. 3 planned meals aren't on a shopping trip yet.",
      '',
      'Today · Mon 2026-11-02',
      '  pl_1a2b3c4d  Lunch   Leftovers (note)',
      'Tomorrow · Tue 2026-11-03',
      '  pl_5d6e7f8a  Dinner  Weeknight chili (rc_9e8f7a6b) · 412 kcal a serving · on list',
      '  pl_oats  Breakfast Oats (rc_oats) · no calories yet · shopped',
      'Wed 2026-11-04',
      '  Nothing planned',
      'Thu 2026-11-05',
      '  pl_stew  Dinner  Beef Stew (rc_stew) · 388 kcal a serving, partial',
      'Fri 2026-11-06',
      '  Nothing planned',
      'Sat 2026-11-07',
      '  Nothing planned',
      'Sun 2026-11-08',
      '  Nothing planned',
      'Mon 2026-11-09',
      '  Nothing planned',
    ])
    expect(textOf(r)).not.toContain(REMINDER)
  })

  it('says the singular, an empty range, and takes relative dates', async () => {
    const sent = api({ getPlan: ok({ entries: [], not_on_trip: 1 }) })
    expect(textOf(await call('forage_list_plan', { from: 'tomorrow', to: '+3d' }))).toBe(
      'Nothing planned from 2026-11-03 to 2026-11-05.',
    )
    expect(sent[0].params.get('from')).toBe('2026-11-03')
    api({ getPlan: ok({ entries: [entry({ date: '2026-11-03', note: 'Out' })], not_on_trip: 1 }) })
    expect(textOf(await call('forage_list_plan', { from: '2026-11-03', to: '2026-11-03' })).split('\n')[0]).toBe(
      "Plan Tue 2026-11-03 to Tue 2026-11-03. 1 planned meal isn't on a shopping trip yet.",
    )
    expect((await call('forage_list_plan', { from: 'next week' })).isError).toBe(true)
  })
})

describe('forage_plan_meal', () => {
  it('checks with a dry run, then saves, naming the meal, with the undo line and the reminder', async () => {
    const sent = api({
      planWeek: (r) => ({
        success: true,
        data: { dry_run: true, entries: [entry({ ...r.payload.entries[0], ...CHILI, skipped: false, duplicate_of: '' })], planned: 1, skipped: 0 },
      }),
      upsertPlanEntry: (r) => ({ success: true, data: entry({ ...CHILI, id: 'pl_5d6e7f8a', date: r.payload.date }) }),
    })
    const r = await call('forage_plan_meal', { date: 'tomorrow', slot: 'Dinner', recipe_id: CHILI.recipe_id })
    expect(sent.map((s) => s.action)).toEqual(['planWeek', 'upsertPlanEntry'])
    expect(sent[0].params.get('payload')).not.toContain('call_id')
    expect(sent[1].payload).toMatchObject({ date: '2026-11-03', slot: 'Dinner', recipe_id: CHILI.recipe_id, allow_duplicate: false })
    expect(sent[1].payload.call_id).toBeTruthy()
    const lines = textOf(r).split('\n')
    expect(lines[0]).toBe('Planned Weeknight chili for Tue 2026-11-03, Dinner (pl_5d6e7f8a).')
    expect(lines[1]).toMatch(/^Undo with forage_undo, call [0-9a-f-]{36}$/)
    expect(textOf(r)).toContain(REMINDER)
    expect(budget.stored.forage).toHaveLength(1)
  })

  it('a duplicate is refused from the dry run: no write sent, no reminder, not counted', async () => {
    const sent = api({
      planWeek: () => ({
        success: true,
        data: {
          dry_run: true,
          entries: [entry({ id: 'pl_new', date: '2026-11-03', ...CHILI, skipped: true, duplicate_of: 'pl_5d6e7f8a' })],
          planned: 0,
          skipped: 1,
        },
      }),
    })
    const r = await call('forage_plan_meal', { date: '2026-11-03', slot: 'Dinner', recipe_id: CHILI.recipe_id })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toBe(
      'Already planned: Weeknight chili on Tue 2026-11-03, Dinner (pl_5d6e7f8a). Pass allow_duplicate: true to add another.',
    )
    expect(sent.map((s) => s.action)).toEqual(['planWeek'])
    expect(budget.stored.forage).toBeUndefined()
  })

  it('a refusal passes the API text after "Nothing saved." with no reminder', async () => {
    const sent = api({
      planWeek: () => ({
        success: false,
        error: 'Nothing saved: entry 1 (2026-11-03): recipe_id "rc_x" is not a recipe',
        code: 'invalid_entries',
        problems: [{ entry: 1, date: '2026-11-03', error: 'recipe_id "rc_x" is not a recipe' }],
      }),
    })
    const r = await call('forage_plan_meal', { date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_x' })
    expect(textOf(r)).toBe('Nothing saved. Entry 1 (2026-11-03): recipe_id "rc_x" is not a recipe.')
    expect(r.isError).toBe(true)
    expect(sent).toHaveLength(1)
    expect((await call('forage_plan_meal', { date: '2026-11-03', slot: 'Dinner' })).content[0].text).toBe(
      'Send exactly one of recipe_id and note. Nothing saved.',
    )
  })

  it('passes id and allow_duplicate through', async () => {
    const sent = api({
      planWeek: (r) => ({ success: true, data: { dry_run: true, entries: [entry({ ...r.payload.entries[0], skipped: false })], planned: 1, skipped: 0 } }),
      upsertPlanEntry: (r) => ({ success: true, data: entry({ id: r.payload.id, note: r.payload.note }) }),
    })
    const r = await call('forage_plan_meal', { date: '2026-11-03', slot: 'Dinner', note: 'Eating out', id: 'pl_mine', allow_duplicate: true })
    expect(sent[0].payload).toMatchObject({ allow_duplicate: true, entries: [{ id: 'pl_mine', note: 'Eating out' }] })
    expect(sent[1].payload).toMatchObject({ id: 'pl_mine', note: 'Eating out', allow_duplicate: true })
    expect(textOf(r).split('\n')[0]).toBe('Planned Eating out for Tue 2026-11-03, Dinner (pl_mine).')
  })
})

describe('forage_move_meal', () => {
  const planned = () => ok({ entries: [entry({ id: 'pl_5d6e7f8a', ...CHILI })], not_on_trip: 1 })

  it('moves the meal, saying from where to where', async () => {
    const sent = api({
      getPlan: planned(),
      movePlanEntry: (r) => ({ success: true, data: entry({ id: 'pl_5d6e7f8a', ...CHILI, date: r.payload.date }) }),
    })
    const r = await call('forage_move_meal', { id: 'pl_5d6e7f8a', date: '2026-11-04' })
    expect(sent.map((s) => s.action)).toEqual(['getPlan', 'movePlanEntry'])
    expect(sent[1].payload).toMatchObject({ id: 'pl_5d6e7f8a', date: '2026-11-04' })
    expect(textOf(r).split('\n')[0]).toBe(
      'Moved Weeknight chili from Tue 2026-11-03, Dinner to Wed 2026-11-04, Dinner (pl_5d6e7f8a).',
    )
    expect(textOf(r)).toContain(REMINDER)
  })

  it('an unknown id sends no write and carries no reminder', async () => {
    const sent = api({ getPlan: planned() })
    const r = await call('forage_move_meal', { id: 'pl_nope', slot: 'Lunch' })
    expect(textOf(r)).toBe('Nothing changed. No meal pl_nope in the plan.')
    expect(r.isError).toBe(true)
    expect(sent.map((s) => s.action)).toEqual(['getPlan'])
    expect(budget.stored.forage).toBeUndefined()
  })

  it('a move to where it already is, or with nothing to change, writes nothing', async () => {
    const sent = api({ getPlan: planned() })
    expect(textOf(await call('forage_move_meal', { id: 'pl_5d6e7f8a', date: '2026-11-03', slot: 'Dinner' }))).toBe(
      'Nothing changed. Weeknight chili is already on Tue 2026-11-03, Dinner.',
    )
    expect(textOf(await call('forage_move_meal', { id: 'pl_5d6e7f8a' }))).toBe(
      'Send at least one of date, slot and note. Nothing changed.',
    )
    expect(sent.map((s) => s.action)).toEqual(['getPlan'])
  })
})

describe('forage_remove_meal', () => {
  it('removes it, and says a trip it was on is unchanged', async () => {
    const onTrip = entry({ id: 'pl_5d6e7f8a', ...CHILI, trip_id: 'tr_1', trip_status: 'open', on_trip: true })
    const sent = api({
      getPlan: ok({ entries: [onTrip], not_on_trip: 0 }),
      deletePlanEntry: ok({ ...onTrip, deleted: true }),
    })
    const r = await call('forage_remove_meal', { id: 'pl_5d6e7f8a' })
    expect(sent.map((s) => s.action)).toEqual(['getPlan', 'deletePlanEntry'])
    expect(textOf(r).split('\n')[0]).toBe(
      'Removed Weeknight chili from Tue 2026-11-03, Dinner (pl_5d6e7f8a). It was on a shopping trip; the trip is unchanged.',
    )
    expect(textOf(r)).toContain(REMINDER)
  })

  it('a meal on no trip gets no second sentence; an unknown one is refused before any write', async () => {
    api({ getPlan: ok({ entries: [entry({ ...CHILI })], not_on_trip: 1 }), deletePlanEntry: ok({ ...entry(CHILI), deleted: true }) })
    expect(textOf(await call('forage_remove_meal', { id: 'pl_1' })).split('\n')[0]).toBe(
      'Removed Weeknight chili from Tue 2026-11-03, Dinner (pl_1).',
    )
    const sent = api({ getPlan: ok({ entries: [], not_on_trip: 0 }) })
    expect(textOf(await call('forage_remove_meal', { id: 'pl_5d6e7f8a' }))).toBe(
      'Nothing changed. No meal pl_5d6e7f8a in the plan.',
    )
    expect(sent.map((s) => s.action)).toEqual(['getPlan'])
  })
})

describe('forage_plan_week', () => {
  const WEEK = [
    { date: '2026-11-04', slot: 'Dinner', recipe_id: CHILI.recipe_id },
    { date: '2026-11-05', slot: 'Dinner', note: 'Eating out' },
    { date: '2026-11-06', slot: 'Dinner', recipe_id: 'rc_stew' },
    { date: '2026-11-07', slot: 'Lunch', recipe_id: 'rc_stew' },
  ]
  const preview = (dry: boolean) => ({
    success: true,
    data: {
      dry_run: dry,
      entries: [
        entry({ id: 'pl_a', date: '2026-11-04', ...CHILI, skipped: false, duplicate_of: '' }),
        entry({ id: 'pl_b', date: '2026-11-05', note: 'Eating out', skipped: false, duplicate_of: '' }),
        entry({ id: 'pl_c', date: '2026-11-06', ...STEW, skipped: false, duplicate_of: '' }),
        entry({ id: 'pl_d', date: '2026-11-07', slot: 'Lunch', ...STEW, skipped: true, duplicate_of: 'pl_old' }),
      ],
      planned: 3,
      skipped: 1,
    },
  })

  it('defaults to a dry run: each meal with its calories and the skipped duplicate, no write, no reminder', async () => {
    const sent = api({ planWeek: (r) => preview(r.payload.dry_run) })
    const r = await call('forage_plan_week', { entries: WEEK })
    expect(sent.map((s) => [s.action, s.payload.dry_run, s.payload.call_id])).toEqual([['planWeek', true, undefined]])
    expect(textOf(r).split('\n')).toEqual([
      'Preview — nothing saved.',
      '4 meals: 3 new, 1 already planned (skipped).',
      'Wed 2026-11-04  Dinner  Weeknight chili · 412 kcal a serving',
      'Thu 2026-11-05  Dinner  Eating out (note)',
      'Fri 2026-11-06  Dinner  Beef Stew · 388 kcal a serving, partial',
      'Sat 2026-11-07  Lunch   Beef Stew — already planned there, skipped',
      'Call again with dry_run: false to save them.',
    ])
    expect(budget.stored.forage).toBeUndefined()
  })

  it('writes only with dry_run: false, counting the rows it adds', async () => {
    const sent = api({ planWeek: (r) => preview(r.payload.dry_run) })
    const r = await call('forage_plan_week', { entries: WEEK, dry_run: false })
    expect(sent.map((s) => [s.action, s.payload.dry_run])).toEqual([
      ['planWeek', true],
      ['planWeek', false],
    ])
    expect(sent[1].payload.call_id).toBeTruthy()
    expect(textOf(r).split('\n')[0]).toBe('Planned 3 meals, skipped 1 already planned.')
    expect(textOf(r)).toContain(REMINDER)
    expect(budget.stored.forage).toEqual([{ t: NOW, rows: 3 }])
  })

  it('a refused week names every entry that failed, and over 28 is refused before any request', async () => {
    api({
      planWeek: () => ({
        success: false,
        code: 'invalid_entries',
        error: 'x',
        problems: [
          { entry: 3, date: '2026-02-30', error: 'date must be a real date as YYYY-MM-DD' },
          { entry: 4, date: '2026-11-07', error: 'note must be 1 to 120 characters' },
        ],
      }),
    })
    const r = await call('forage_plan_week', { entries: WEEK, dry_run: false })
    expect(textOf(r)).toBe(
      'Nothing saved. Entry 3 (2026-02-30): not a real date.\nEntry 4 (2026-11-07): note must be 1 to 120 characters.',
    )
    expect(r.isError).toBe(true)
    const sent = api({})
    const many = Array.from({ length: 31 }, () => ({ date: '2026-11-04', slot: 'Snacks', note: 'x' }))
    expect(textOf(await call('forage_plan_week', { entries: many }))).toBe('Nothing saved. 31 entries is over the limit of 28.')
    expect(sent).toEqual([])
  })

  it('resolves relative dates before sending', async () => {
    const sent = api({ planWeek: (r) => preview(r.payload.dry_run) })
    await call('forage_plan_week', { entries: [{ date: '+2d', slot: 'Dinner', note: 'Out' }] })
    expect(sent[0].payload.entries[0].date).toBe('2026-11-04')
  })
})
