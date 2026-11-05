import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import { fakeBudget } from '../../test/fake-budget'
import { handleForage } from './index'
import { FORAGE_READ_TOOLS } from './tools'

// #712: the food log's four tools over a fake Forage API, with the wording of
// forage/docs/design/712-food-log.md. The API's own rules (the totals shape,
// dry_run, when an edit re-snapshots) are in forage/apps-script/tests/food-log.test.ts.

const KEY = 'forage-key'
const URL_ = 'https://script.google.com/macros/s/forage/exec'
// 11:00 on Thursday 5 November in Denver.
const NOW = Date.UTC(2026, 10, 5, 18)
const TODAY = '2026-11-05'
const REMINDER = "— Forage (write) is on. Turn it off in Search and tools when you've finished writing."

let budget = fakeBudget({ now: NOW })
const env = () => ({ FORAGE_API_URL: URL_, FORAGE_API_KEY: KEY, WRITE_BUDGET: budget.namespace }) as Env

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

const ok = (data: unknown) => () => ({ success: true, data })

const FOODS = [
  { id: 'fd_yog', name: 'Greek yogurt', brand: '' },
  { id: 'fd_bar', name: 'bar', brand: 'KIND' },
  { id: 'fd_herbs', name: 'Herbes de Provence', brand: '' },
]
const RECIPES = [{ id: 'rc_stew', name: 'Beef Stew' }]

/** A fake API answering by action, with the food and recipe names; anything unlisted is an unknown action. */
function api(answers: Record<string, (r: Sent) => unknown>) {
  const sent: Sent[] = []
  const all: Record<string, (r: Sent) => unknown> = { getFoods: ok(FOODS), getRecipes: ok(RECIPES), ...answers }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: string, init?: RequestInit) => {
      const params = new URLSearchParams(String(init?.body ?? ''))
      const raw = params.get('payload')
      const r = { action: params.get('action') ?? '', payload: raw ? JSON.parse(raw) : undefined, params }
      sent.push(r)
      const fn = all[r.action]
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

function entry(over: Record<string, unknown>) {
  return {
    id: 'lg_1',
    date: TODAY,
    slot: 'Breakfast',
    food_id: '',
    recipe_id: '',
    qty: 1,
    unit: 'g',
    grams: null,
    kcal: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    partial: false,
    source: 'app',
    logged_at: 'x',
    created: 'x',
    updated: 'x',
    ...over,
  }
}

const YOGURT = entry({
  id: 'lg_1a2b3c4d',
  food_id: 'fd_yog',
  unit: 'cup',
  grams: 245,
  kcal: 150,
  protein_g: 6,
  carbs_g: 9,
  fat_g: 0.4,
})
const BARS = entry({ id: 'lg_9e8f7a6b', food_id: 'fd_bar', qty: 2, unit: 'bar', grams: 80, kcal: 380, protein_g: 8 })
const STEW = entry({
  id: 'lg_5d6e7f8a',
  slot: 'Lunch',
  recipe_id: 'rc_stew',
  unit: 'serving',
  kcal: 412,
  protein_g: 30,
  carbs_g: 20,
  fat_g: 18,
  partial: true,
})
const HERBS = entry({ id: 'lg_herbs', slot: 'Snacks', food_id: 'fd_herbs', qty: 2, unit: 'g', grams: 2, partial: true })

const DAY = {
  date: TODAY,
  entries: 4,
  unknown_entries: 1,
  kcal: 1240.5,
  protein_g: 62.1,
  carbs_g: 140,
  fat_g: 48.3,
  partial: true,
}

const textOf = (r: Result) => r.content[0].text

describe('forage_food_log', () => {
  it('reads today by default: the day line from the totals, then each meal', async () => {
    const sent = api({ getFoodLog: ok([YOGURT, BARS, STEW, HERBS]), getFoodLogTotals: ok({ days: [DAY] }) })
    const r = await call('forage_food_log')
    expect(r.isError).toBeUndefined()
    const reads = sent.filter((s) => s.action.startsWith('getFoodLog'))
    expect(reads.map((s) => [s.action, s.params.get('from'), s.params.get('to')])).toEqual([
      ['getFoodLog', TODAY, TODAY],
      ['getFoodLogTotals', TODAY, TODAY],
    ])
    expect(textOf(r).split('\n')).toEqual([
      'Thu 2026-11-05 — 1,241 kcal so far (low: 1 entry has no nutrition, 1 entry is partial). Protein 62 g · Carbs 140 g · Fat 48 g.',
      'Breakfast',
      '  lg_1a2b3c4d  Greek yogurt · 1 cup (245 g) · 150 kcal',
      '  lg_9e8f7a6b  KIND bar · 2 bar (80 g) · 380 kcal',
      'Lunch',
      '  lg_5d6e7f8a  Beef Stew · 1 serving · 412 kcal (partial)',
      'Dinner',
      '  (nothing)',
      'After dinner',
      '  (nothing)',
      'Snacks',
      '  lg_herbs  Herbes de Provence · 2 g · no nutrition',
    ])
  })

  it('a range lists each day, newest last; a day with nothing logged says so, and "so far" is only today', async () => {
    api({
      getFoodLog: ok([{ ...YOGURT, date: '2026-11-03' }]),
      getFoodLogTotals: ok({
        days: [{ ...DAY, date: '2026-11-03', entries: 1, unknown_entries: 0, kcal: 150, protein_g: 6, carbs_g: 9, fat_g: 0.4, partial: false }],
      }),
    })
    const r = await call('forage_food_log', { from: '2026-11-03', to: '2026-11-04' })
    expect(textOf(r).split('\n')).toEqual([
      'Tue 2026-11-03 — 150 kcal. Protein 6 g · Carbs 9 g · Fat 0 g.',
      'Breakfast',
      '  lg_1a2b3c4d  Greek yogurt · 1 cup (245 g) · 150 kcal',
      'Lunch',
      '  (nothing)',
      'Dinner',
      '  (nothing)',
      'After dinner',
      '  (nothing)',
      'Snacks',
      '  (nothing)',
      'Wed 2026-11-04 — nothing logged.',
    ])
  })

  it('refuses more than 31 days before any request', async () => {
    const sent = api({})
    const r = await call('forage_food_log', { from: '2026-10-01', to: '2026-11-05' })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toBe('That is more than 31 days. Ask for fewer.')
    expect(sent).toEqual([])
  })

  it('is a read tool', () => {
    expect(FORAGE_READ_TOOLS.has('forage_food_log')).toBe(true)
  })
})

describe('forage_food_log: the second lines (#755)', () => {
  it('the day and each entry with known values beyond the four get a second line of only those; the rest none', async () => {
    const yogurt = { ...YOGURT, satfat_g: 0.24, sodium_mg: 89.6, sugars_g: 8.1, fiber_g: null }
    const day = { ...DAY, satfat_g: 3.04, sodium_mg: 640.4, fiber_g: 8, sugars_g: 12.5, transfat_g: null, unknown: { sodium_mg: 2 } }
    api({ getFoodLog: ok([yogurt, BARS, STEW, HERBS]), getFoodLogTotals: ok({ days: [day] }) })
    expect(textOf(await call('forage_food_log')).split('\n')).toEqual([
      'Thu 2026-11-05 — 1,241 kcal so far (low: 1 entry has no nutrition, 1 entry is partial). Protein 62 g · Carbs 140 g · Fat 48 g.',
      'Sat fat 3 g · Sodium 640 mg · Fiber 8 g · Sugars 12.5 g',
      'Breakfast',
      '  lg_1a2b3c4d  Greek yogurt · 1 cup (245 g) · 150 kcal',
      '      Sat fat 0.2 g · Sodium 90 mg · Sugars 8.1 g',
      '  lg_9e8f7a6b  KIND bar · 2 bar (80 g) · 380 kcal',
      'Lunch',
      '  lg_5d6e7f8a  Beef Stew · 1 serving · 412 kcal (partial)',
      'Dinner',
      '  (nothing)',
      'After dinner',
      '  (nothing)',
      'Snacks',
      '  lg_herbs  Herbes de Provence · 2 g · no nutrition',
    ])
  })
})

describe('forage_log_food', () => {
  it('is a dry run by default: the preview, no reminder, not counted, no call id', async () => {
    const sent = api({ logFood: (r) => ({ success: true, data: { ...YOGURT, slot: 'Dinner', ...r.payload, id: 'lg_new' } }) })
    const r = await call('forage_log_food', { food_id: 'fd_yog', qty: 1, unit: 'cup', slot: 'Dinner' })
    expect(r.isError).toBeUndefined()
    const log = sent.find((s) => s.action === 'logFood')!
    expect(log.payload).toEqual({ food_id: 'fd_yog', qty: 1, slot: 'Dinner', unit: 'cup', date: TODAY, dry_run: true })
    expect(textOf(r)).toBe(
      [
        'Preview — nothing logged.',
        'Dinner · Thu 2026-11-05',
        'Greek yogurt · 1 cup (245 g) · 150 kcal · Protein 6 g · Carbs 9 g · Fat 0.4 g',
        '',
        'Call again with dry_run: false to log it.',
      ].join('\n'),
    )
    expect(textOf(r)).not.toContain(REMINDER)
    expect(budget.stored.forage).toBeUndefined()
  })

  it('a food with no nutrition previews as unknown', async () => {
    api({ logFood: (r) => ({ success: true, data: { ...HERBS, ...r.payload } }) })
    const r = await call('forage_log_food', { food_id: 'fd_herbs', qty: 2, unit: 'g', slot: 'Snacks' })
    expect(textOf(r)).toContain('Herbes de Provence · 2 g · no nutrition\nNo nutrition on this food, so it will count as unknown.')
  })

  it('dry_run false logs it, with its id, the undo line and the reminder', async () => {
    const sent = api({ logFood: (r) => ({ success: true, data: { ...YOGURT, ...r.payload, slot: 'Dinner' } }) })
    const r = await call('forage_log_food', { food_id: 'fd_yog', qty: 1, unit: 'cup', slot: 'Dinner', dry_run: false })
    const log = sent.find((s) => s.action === 'logFood')!
    expect(log.payload.dry_run).toBeUndefined()
    expect(log.payload.call_id).toEqual(expect.any(String))
    expect(textOf(r)).toMatch(
      /^Logged Greek yogurt to Dinner on Thu 2026-11-05: 150 kcal \(id lg_1a2b3c4d\)\.\nUndo with forage_undo, call \S+/,
    )
    expect(textOf(r)).toContain(REMINDER)
    expect(budget.stored.forage).toHaveLength(1)
  })

  it('a recipe is logged in servings', async () => {
    const sent = api({ logFood: (r) => ({ success: true, data: { ...STEW, ...r.payload } }) })
    await call('forage_log_food', { recipe_id: 'rc_stew', qty: 1, slot: 'Lunch', date: '2026-11-04' })
    expect(sent.find((s) => s.action === 'logFood')!.payload).toMatchObject({ recipe_id: 'rc_stew', unit: 'serving', date: '2026-11-04' })
  })

  it("a refusal is the API's text, with no reminder", async () => {
    api({ logFood: () => ({ success: false, error: 'food_id "fd_ab12cd34" is not a food' }) })
    const r = await call('forage_log_food', { food_id: 'fd_ab12cd34', qty: 1, unit: 'g', slot: 'Dinner', dry_run: false })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toBe('Nothing logged. food_id "fd_ab12cd34" is not a food')
  })

  it('needs exactly one of food_id and recipe_id, and a food needs a unit', async () => {
    const sent = api({})
    expect(textOf(await call('forage_log_food', { qty: 1, slot: 'Dinner' }))).toBe(
      'Send exactly one of food_id and recipe_id. Nothing logged.',
    )
    expect(textOf(await call('forage_log_food', { food_id: 'fd_yog', qty: 1, slot: 'Dinner' }))).toBe(
      "Send unit: one of the food's servings, or g. Nothing logged.",
    )
    expect(sent).toEqual([])
  })
})

describe('forage_update_log', () => {
  it('previews before and after by default, writing nothing', async () => {
    const sent = api({
      getFoodLog: ok([YOGURT]),
      updateLogEntry: (r) => ({ success: true, data: { ...YOGURT, ...r.payload.changes } }),
    })
    const r = await call('forage_update_log', { id: 'lg_1a2b3c4d', slot: 'Lunch' })
    expect(sent.find((s) => s.action === 'updateLogEntry')!.payload).toEqual({
      id: 'lg_1a2b3c4d',
      changes: { slot: 'Lunch' },
      dry_run: true,
    })
    expect(textOf(r).split('\n')).toEqual([
      'Preview — nothing changed.',
      'Before: Breakfast · Thu 2026-11-05 · Greek yogurt · 1 cup (245 g) · 150 kcal',
      'After:  Lunch · Thu 2026-11-05 · Greek yogurt · 1 cup (245 g) · 150 kcal',
      '',
      'Call again with dry_run: false to save it.',
    ])
    expect(budget.stored.forage).toBeUndefined()
  })

  it('dry_run false saves, with the undo line and the reminder', async () => {
    api({
      getFoodLog: ok([YOGURT]),
      updateLogEntry: (r) => ({ success: true, data: { ...YOGURT, qty: 2, grams: 490, kcal: 300 } }),
    })
    const r = await call('forage_update_log', { id: 'lg_1a2b3c4d', qty: 2, dry_run: false })
    expect(textOf(r)).toContain('Updated lg_1a2b3c4d.\nBefore: Breakfast · Thu 2026-11-05 · Greek yogurt · 1 cup (245 g) · 150 kcal\n')
    expect(textOf(r)).toContain('After:  Breakfast · Thu 2026-11-05 · Greek yogurt · 2 cup (490 g) · 300 kcal')
    expect(textOf(r)).toContain(REMINDER)
  })

  it('an unknown id or no change sends no write', async () => {
    const sent = api({ getFoodLog: ok([]) })
    expect(textOf(await call('forage_update_log', { id: 'lg_gone', qty: 2 }))).toBe('Nothing changed. No log entry lg_gone.')
    expect(textOf(await call('forage_update_log', { id: 'lg_gone' }))).toBe(
      'Send at least one of qty, unit and slot. Nothing changed.',
    )
    expect(sent.map((s) => s.action)).toEqual(['getFoodLog'])
  })
})

describe('forage_delete_log', () => {
  it('deletes, naming the entry, with the undo line and the reminder', async () => {
    const sent = api({ getFoodLog: ok([{ ...YOGURT, slot: 'Dinner' }]), deleteLogEntry: ok({ id: 'lg_1a2b3c4d', deleted: true }) })
    const r = await call('forage_delete_log', { id: 'lg_1a2b3c4d' })
    expect(sent.find((s) => s.action === 'deleteLogEntry')!.payload).toMatchObject({ id: 'lg_1a2b3c4d' })
    expect(textOf(r)).toMatch(
      /^Deleted lg_1a2b3c4d \(Greek yogurt, Dinner, Thu 2026-11-05\)\.\nUndo with forage_undo, call \S+/,
    )
    expect(textOf(r)).toContain(REMINDER)
  })

  it('an unknown id sends no write', async () => {
    const sent = api({ getFoodLog: ok([]) })
    expect(textOf(await call('forage_delete_log', { id: 'lg_gone' }))).toBe('Nothing changed. No log entry lg_gone.')
    expect(sent.map((s) => s.action)).toEqual(['getFoodLog'])
  })
})
