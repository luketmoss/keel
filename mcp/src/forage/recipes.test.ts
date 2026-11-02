import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import { fakeBudget } from '../../test/fake-budget'
import { handleForage } from './index'
import { FORAGE_READ_TOOLS } from './tools'

// #708: the recipe and cook tools over a fake Forage API. The API's own rules
// (search, sort, merging upsertCook) are tested in forage/apps-script/tests/recipes-cooks.test.ts.

const KEY = 'forage-key'
const URL_ = 'https://script.google.com/macros/s/forage/exec'
const env = {
  FORAGE_API_URL: URL_,
  FORAGE_API_KEY: KEY,
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
afterEach(() => vi.unstubAllGlobals())

const ok = (data: unknown) => () => ({ success: true, data })

const STEW = {
  id: 'rc_stew',
  name: 'Beef Stew',
  source_url: 'https://example.com/stew',
  source_site: 'example.com',
  servings: 6,
  total_min: 150,
  notes: '',
  created: '2026-10-01T00:00:00Z',
  nutrition: { per_serving: { kcal: 412.3, protein_g: 30, carbs_g: 20, fat_g: 18 }, missing: [], partial: false },
  partial: false,
  rating: 4,
  last_cooked: '2026-10-28',
  cook_count: 2,
  unrated_cook_id: null,
  has_walkthrough: true,
  lines: [
    { line_id: 'L1', section: '', text: '2 lb beef chuck', qty: 2, unit: 'lb', food_id: 'fd_beef', grams: null, optional: false, resolved_grams: 907.2 },
    { line_id: 'L2', section: 'To serve', text: 'parsley', qty: null, unit: '', food_id: '', grams: null, optional: true, resolved_grams: null },
  ],
  steps: [{ recipe_id: 'rc_stew', position: 1, section: '', name: 'Brown the beef', text: 'Brown it.' }],
}
const COOKS = [
  { id: 'ck_2', recipe_id: 'rc_stew', recipe_name: 'Beef Stew', date: '2026-10-28', rating: 4, note: 'Good', plan_id: '', created: 'x' },
  { id: 'ck_1', recipe_id: 'rc_stew', recipe_name: 'Beef Stew', date: '2026-10-04', rating: null, note: '', plan_id: '', created: 'x' },
]

describe('the read tools', () => {
  it('forage_search_recipes sends q and sort, and answers compact rows with matched_line', async () => {
    const sent = api({ getRecipes: ok([{ ...STEW, matched_line: '2 lb beef chuck' }, { ...STEW, id: 'rc_2', matched_line: '' }]) })
    const r = await call('forage_search_recipes', { q: ' chuck ', sort: 'rating', limit: 1 })
    expect(sent[0].params.get('q')).toBe('chuck')
    expect(sent[0].params.get('sort')).toBe('rating')
    expect(sent[0].params.get('call_id')).toBeNull()
    expect(JSON.parse(r.content[0].text)).toEqual({
      count: 2,
      recipes: [
        {
          id: 'rc_stew',
          name: 'Beef Stew',
          source_site: 'example.com',
          servings: 6,
          rating: 4,
          last_cooked: '2026-10-28',
          cook_count: 2,
          kcal_per_serving: 412,
          partial: false,
          has_walkthrough: true,
          matched_line: '2 lb beef chuck',
        },
      ],
    })
  })

  it('forage_get_recipe answers lines with food names, steps, and the last 5 cooks', async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...COOKS[0], id: `ck_${i}` }))
    api({
      getRecipe: ok(STEW),
      getCooks: (r) => {
        expect(r.params.get('recipe_id')).toBe('rc_stew')
        return { success: true, data: many }
      },
      getFoods: ok([{ id: 'fd_beef', name: 'Beef chuck', brand: '' }]),
    })
    const out = JSON.parse((await call('forage_get_recipe', { id: 'rc_stew' })).content[0].text)
    expect(out.lines[0]).toMatchObject({ line_id: 'L1', text: '2 lb beef chuck', food_name: 'Beef chuck', resolved_grams: 907.2 })
    expect(out.lines[1]).toMatchObject({ section: 'To serve', optional: true, food_name: '' })
    expect(out.steps).toEqual([{ position: 1, section: '', name: 'Brown the beef', text: 'Brown it.' }])
    expect(out.cooks).toHaveLength(5)
    expect(out).toMatchObject({ rating: 4, last_cooked: '2026-10-28', has_walkthrough: true })
  })

  it('forage_cook_history filters by since and limit, newest first as the API answers', async () => {
    const sent = api({ getCooks: ok(COOKS) })
    const out = JSON.parse((await call('forage_cook_history', { since: '2026-10-10' })).content[0].text)
    expect(sent[0].params.get('recipe_id')).toBeNull()
    expect(out).toEqual({
      count: 1,
      cooks: [{ id: 'ck_2', recipe_id: 'rc_stew', recipe_name: 'Beef Stew', date: '2026-10-28', rating: 4, note: 'Good', plan_id: '' }],
    })
    expect((await call('forage_cook_history', { since: 'last week' })).isError).toBe(true)
  })
})

describe('the write tools', () => {
  it('forage_update_recipe patches lines by line_id, keeping the rest, under one call id', async () => {
    const sent = api({ getRecipe: ok(STEW), upsertRecipe: ok({ ...STEW, name: 'Stew' }) })
    const r = await call('forage_update_recipe', { id: 'rc_stew', name: 'Stew', lines: [{ line_id: 'L2', food_id: 'fd_parsley' }] })
    const write = sent.find((s) => s.action === 'upsertRecipe')!
    expect(write.payload.name).toBe('Stew')
    expect(write.payload.lines).toEqual([
      { line_id: 'L1', section: '', text: '2 lb beef chuck', qty: 2, unit: 'lb', food_id: 'fd_beef', grams: null, optional: false },
      { line_id: 'L2', section: 'To serve', text: 'parsley', qty: null, unit: '', food_id: 'fd_parsley', grams: null, optional: true },
    ])
    expect(write.payload).not.toHaveProperty('steps')
    expect(write.payload.call_id).toBeTruthy()
    expect(r.content[0].text).toContain('Updated "Stew" (rc_stew): name, lines L2.')
    expect(r.content[0].text).toContain(REMINDER)
  })

  it('forage_update_recipe refuses an unknown line and an empty change, sending no write', async () => {
    const sent = api({ getRecipe: ok(STEW) })
    const r = await call('forage_update_recipe', { id: 'rc_stew', lines: [{ line_id: 'L9', text: 'x' }] })
    expect(r).toMatchObject({ isError: true })
    expect(r.content[0].text).toBe('Nothing saved. Beef Stew has no line L9.')
    expect((await call('forage_update_recipe', { id: 'rc_stew' })).content[0].text).toBe(
      'Nothing to change: send a field, lines or steps. Nothing saved.',
    )
    expect(sent.map((s) => s.action)).toEqual(['getRecipe'])
  })

  it('forage_log_cook sends only what was given, and names the recipe', async () => {
    const sent = api({
      upsertCook: (r) => ({ success: true, data: { id: 'ck_9', recipe_name: 'Beef Stew', date: '2026-11-01', rating: null, note: '', ...r.payload } }),
    })
    const r = await call('forage_log_cook', { recipe_id: 'rc_stew', id: 'ck_9' })
    expect(sent[0].payload).toEqual({ id: 'ck_9', recipe_id: 'rc_stew', call_id: sent[0].payload.call_id })
    expect(r.content[0].text).toContain('Logged a cook of Beef Stew on 2026-11-01 (ck_9), no rating.')
    expect(r.content[0].text).toContain(REMINDER)
  })

  it('forage_rate_cook rates the latest cook of a recipe, or clears a named cook', async () => {
    const sent = api({
      getCooks: ok(COOKS),
      upsertCook: (r) => ({ success: true, data: { ...COOKS.find((c) => c.id === r.payload.id), ...r.payload } }),
    })
    const r = await call('forage_rate_cook', { recipe_id: 'rc_stew', rating: 5 })
    expect(sent[1].payload).toMatchObject({ id: 'ck_2', rating: 5 })
    expect(r.content[0].text).toContain('Rated the cook of Beef Stew on 2026-10-28 (ck_2) 5 stars, note "Good".')
    const cleared = await call('forage_rate_cook', { cook_id: 'ck_1', rating: null })
    expect(sent[3].payload).toMatchObject({ id: 'ck_1', rating: null })
    expect(cleared.content[0].text).toContain('Cleared the rating of the cook of Beef Stew on 2026-10-04 (ck_1).')
  })

  it('forage_rate_cook refuses a recipe with no cooks, naming it', async () => {
    const sent = api({ getCooks: ok([]), getRecipe: ok(STEW) })
    const r = await call('forage_rate_cook', { recipe_id: 'rc_stew', rating: 4 })
    expect(r).toMatchObject({ isError: true })
    expect(r.content[0].text).toBe('Beef Stew has not been cooked yet. Log a cook first.')
    expect(sent.some((s) => s.action === 'upsertCook')).toBe(false)
  })

  it('forage_delete_recipe names the planned and logged meals that keep it', async () => {
    api({
      deleteRecipe: () => ({ success: false, code: 'in_use', error: 'in use', uses: { plan: ['pl_1'], log: ['lg_1', 'lg_2'] } }),
    })
    const r = await call('forage_delete_recipe', { id: 'rc_stew' })
    expect(r.content[0].text).toBe('Nothing deleted — rc_stew is used by plan entries pl_1 and log entries lg_1, lg_2. Remove those first.')
    api({ deleteRecipe: ok({ id: 'rc_stew', deleted: true }) })
    expect((await call('forage_delete_recipe', { id: 'rc_stew' })).content[0].text).toContain('Deleted recipe rc_stew')
  })
})
