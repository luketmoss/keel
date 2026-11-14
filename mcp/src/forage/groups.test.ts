import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import { fakeBudget } from '../../test/fake-budget'
import { handleForage } from './index'
import { FORAGE_READ_TOOLS } from './tools'

// #878: the group, usual-logging and meal-copy tools over a fake Forage API. The
// API's own rules are tested in forage/apps-script/tests/log-groups.test.ts.

const env = {
  FORAGE_API_URL: 'https://script.google.com/macros/s/forage/exec',
  FORAGE_API_KEY: 'forage-key',
  WRITE_BUDGET: fakeBudget({ now: Date.UTC(2026, 10, 1, 18) }).namespace,
} as Env
const REMINDER = "— Forage (write) is on. Turn it off in Search and tools when you've finished writing."

type Result = { content: { text: string }[]; isError?: boolean }
type Sent = { action: string; payload: any; params: URLSearchParams }

async function call(name: string, args: Record<string, unknown> = {}): Promise<Result> {
  const mode = FORAGE_READ_TOOLS.has(name) ? 'read' : 'write'
  const req = new Request('https://example.test/forage/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  })
  const res = await handleForage(req, env, mode)
  return ((await res.json()) as { result: Result }).result
}

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
      return new Response(JSON.stringify(fn ? fn(r) : { success: false, error: `Unknown action "${r.action}"` }), { status: 200 })
    }),
  )
  return sent
}
afterEach(() => vi.unstubAllGlobals())

const ok = (data: unknown) => () => ({ success: true, data })
const text = (r: Result) => r.content[0].text

const FOODS = [
  { id: 'fd_oats', name: 'Oats', brand: '' },
  { id: 'fd_pb', name: 'Peanut butter', brand: '' },
]
const entry = (id: string, food_id: string, over: Record<string, unknown> = {}) => ({
  id, date: '2026-11-01', slot: 'Breakfast', food_id, recipe_id: '', qty: 1, unit: 'cup', grams: 80, kcal: 300, partial: false,
  protein_g: 10, carbs_g: 50, fat_g: 5, group_id: 'gr_1a2b3c4d', group_name: 'Oatmeal', usual_id: 'us_1', usual_line_id: 'L1', ...over,
})
const GROUP = { entries: [entry('lg_1', 'fd_oats'), entry('lg_2', 'fd_pb', { usual_line_id: 'L2', unit: 'tbsp' })], group_id: 'gr_1a2b3c4d' }

describe('the group tools', () => {
  it('are write tools', () => {
    for (const t of ['forage_log_usual', 'forage_log_group', 'forage_copy_meal', 'forage_group_log']) {
      expect(FORAGE_READ_TOOLS.has(t), t).toBe(false)
    }
  })

  it('forage_log_usual previews by default and writes nothing', async () => {
    const sent = api({ logUsual: ok(GROUP), getFoods: ok(FOODS), getRecipes: ok([]) })
    const r = await call('forage_log_usual', { usual_id: 'us_1', slot: 'Breakfast', date: '2026-11-01', picks: { L3: 'fd_bran' } })
    expect(sent.find((s) => s.action === 'logUsual')!.payload).toMatchObject({
      usual_id: 'us_1', slot: 'Breakfast', date: '2026-11-01', picks: { L3: 'fd_bran' }, dry_run: true,
    })
    expect(sent.find((s) => s.action === 'logUsual')!.payload.call_id).toBeUndefined()
    expect(text(r)).toContain('Preview — nothing logged.')
    expect(text(r)).toContain('Oats')
    expect(text(r)).not.toContain(REMINDER)
  })

  it('forage_log_usual with dry_run false logs, names the undo call and carries the reminder', async () => {
    const sent = api({ logUsual: ok(GROUP), getFoods: ok(FOODS), getRecipes: ok([]) })
    const r = await call('forage_log_usual', { usual_id: 'us_1', slot: 'Breakfast', date: '2026-11-01', dry_run: false })
    const s = sent.find((x) => x.action === 'logUsual')!
    expect(s.payload.dry_run).toBeUndefined()
    expect(text(r)).toContain(`Undo with forage_undo, call ${s.payload.call_id}`)
    expect(text(r)).toContain('[group Oatmeal gr_1a2b3c4d, usual us_1, line L1]')
    expect(text(r)).toContain(REMINDER)
  })

  it('forage_log_usual says nothing was logged when the API refuses', async () => {
    api({ logUsual: () => ({ success: false, error: 'picks.L3 "x" is not one of that line\'s options' }) })
    const r = await call('forage_log_usual', { usual_id: 'us_1', slot: 'Breakfast', date: '2026-11-01', dry_run: false })
    expect(r.isError).toBe(true)
    expect(text(r)).toBe('Nothing logged. picks.L3 "x" is not one of that line\'s options')
  })

  it('forage_log_group sends the items under a name', async () => {
    const sent = api({ logGroup: ok(GROUP), getFoods: ok(FOODS), getRecipes: ok([]) })
    const items = [{ food_id: 'fd_oats', qty: 1, unit: 'cup' }, { food_id: 'fd_pb', qty: 2, unit: 'tbsp' }]
    const r = await call('forage_log_group', { name: 'Toast', slot: 'Snacks', date: '2026-11-01', items, dry_run: false })
    expect(sent.find((s) => s.action === 'logGroup')!.payload).toMatchObject({ name: 'Toast', slot: 'Snacks', date: '2026-11-01', items })
    expect(text(r)).toContain(REMINDER)
  })

  it('forage_copy_meal sends the meal and answers the copies with the undo call', async () => {
    const sent = api({ getFoodLog: ok([entry('lg_1', 'fd_oats')]), copyMeal: ok([entry('lg_9', 'fd_oats', { date: '2026-11-02' })]), getFoods: ok(FOODS), getRecipes: ok([]) })
    const r = await call('forage_copy_meal', { from_date: '2026-11-01', from_slot: 'Breakfast', to_date: '2026-11-02' })
    const s = sent.find((x) => x.action === 'copyMeal')!
    expect(s.payload).toMatchObject({ from_date: '2026-11-01', from_slot: 'Breakfast', to_date: '2026-11-02', to_slot: 'Breakfast' })
    expect(text(r)).toContain('Copied 1 entry to Breakfast')
    expect(text(r)).toContain(`Undo with forage_undo, call ${s.payload.call_id}`)
  })

  it('forage_copy_meal passes the API\'s refusal on', async () => {
    api({ getFoodLog: ok([]), copyMeal: () => ({ success: false, error: 'to_date 2999-01-01 is after today' }) })
    const r = await call('forage_copy_meal', { from_date: '2026-11-01', from_slot: 'Breakfast', to_date: '2999-01-01' })
    expect(r.isError).toBe(true)
    expect(text(r)).toBe('Nothing copied. to_date 2999-01-01 is after today')
  })

  it('forage_group_log sends null to ungroup and an object to group', async () => {
    const sent = api({ setLogGroup: ok(GROUP.entries), getFoods: ok(FOODS), getRecipes: ok([]) })
    await call('forage_group_log', { ids: ['lg_1', 'lg_2'], group: null })
    await call('forage_group_log', { ids: ['lg_1', 'lg_2'], group: { name: 'Oatmeal', usual_id: 'us_1' } })
    const writes = sent.filter((s) => s.action === 'setLogGroup')
    expect(writes[0].payload).toMatchObject({ ids: ['lg_1', 'lg_2'], group: null })
    expect(writes[1].payload).toMatchObject({ group: { name: 'Oatmeal', usual_id: 'us_1' } })
  })

  it('forage_delete_log takes ids, checks them first, and sends one call', async () => {
    const sent = api({
      getFoodLog: ok([entry('lg_1', 'fd_oats'), entry('lg_2', 'fd_pb')]),
      deleteLogEntry: ok({ ids: ['lg_1', 'lg_2'], deleted: true }),
      getFoods: ok(FOODS),
      getRecipes: ok([]),
    })
    const r = await call('forage_delete_log', { ids: ['lg_1', 'lg_2'] })
    expect(sent.filter((s) => s.action === 'deleteLogEntry')).toHaveLength(1)
    expect(sent.find((s) => s.action === 'deleteLogEntry')!.payload).toMatchObject({ ids: ['lg_1', 'lg_2'] })
    expect(text(r)).toContain('Deleted 2 entries')

    const sent2 = api({ getFoodLog: ok([entry('lg_1', 'fd_oats')]), deleteLogEntry: ok({}) })
    const bad = await call('forage_delete_log', { ids: ['lg_1', 'lg_ghost'] })
    expect(bad.isError).toBe(true)
    expect(text(bad)).toContain('lg_ghost')
    expect(sent2.some((s) => s.action === 'deleteLogEntry')).toBe(false)
    expect((await call('forage_delete_log', {})).isError).toBe(true)
  })

  it('forage_food_log shows an entry\'s group', async () => {
    api({
      getFoodLog: ok([entry('lg_1', 'fd_oats')]),
      getFoodLogTotals: ok({ days: [{ date: '2026-11-01', entries: 1, unknown_entries: 0, kcal: 300, protein_g: 10, carbs_g: 50, fat_g: 5, partial: false }] }),
      getFoods: ok(FOODS),
      getRecipes: ok([]),
    })
    const r = await call('forage_food_log', { date: '2026-11-01' })
    expect(text(r)).toContain('lg_1  Oats')
    expect(text(r)).toContain('[group Oatmeal gr_1a2b3c4d, usual us_1, line L1]')
  })
})
