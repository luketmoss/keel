import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import { fakeBudget } from '../../test/fake-budget'
import { handleForage } from './index'
import { FORAGE_READ_TOOLS } from './tools'

// #877: the usual tools over a fake Forage API. The API's own rules are tested in
// forage/apps-script/tests/usuals.test.ts.

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
const FOODS = [
  { id: 'fd_oats', name: 'Oats', brand: '' },
  { id: 'fd_corn', name: 'Corn flakes', brand: 'Kellogg' },
  { id: 'fd_bran', name: 'Bran flakes', brand: '' },
]
const OPTIONS = [
  { food_id: 'fd_corn', qty: 1.25, unit: 'cup' },
  { food_id: 'fd_bran', qty: 1, unit: 'cup' },
]
const USUAL = {
  id: 'us_1',
  name: 'Cereal',
  slot: 'After dinner',
  created: 'x',
  updated: 'x',
  lines: [
    { line_id: 'L1', position: 1, food_id: 'fd_oats', qty: 0.5, unit: 'cup', options: null, last_pick: '' },
    { line_id: 'L2', position: 2, food_id: '', qty: null, unit: '', options: OPTIONS, last_pick: '' },
  ],
  start: { kcal: 300, partial: false },
  used_count: 0,
  last_used: null,
}

describe('the usual tools', () => {
  it('reads are on the read endpoint and writes are not', () => {
    expect(FORAGE_READ_TOOLS.has('forage_list_usuals')).toBe(true)
    expect(FORAGE_READ_TOOLS.has('forage_get_usual')).toBe(true)
    expect(FORAGE_READ_TOOLS.has('forage_save_usual')).toBe(false)
    expect(FORAGE_READ_TOOLS.has('forage_delete_usual')).toBe(false)
  })

  it('forage_list_usuals sends the slot and answers each usual with food names and per-option amounts', async () => {
    const sent = api({ getUsuals: ok([USUAL]), getFoods: ok(FOODS) })
    const r = await call('forage_list_usuals', { slot: 'After dinner' })
    expect(sent[0]).toMatchObject({ action: 'getUsuals' })
    expect(sent[0].params.get('slot')).toBe('After dinner')
    const out = JSON.parse(r.content[0].text)
    expect(out.count).toBe(1)
    expect(out.usuals[0].lines[0]).toMatchObject({ food_name: 'Oats', qty: 0.5, unit: 'cup' })
    expect(out.usuals[0].lines[1].pick_one).toEqual([
      { food_id: 'fd_corn', food_name: 'Kellogg Corn flakes', qty: 1.25, unit: 'cup' },
      { food_id: 'fd_bran', food_name: 'Bran flakes', qty: 1, unit: 'cup' },
    ])
    expect(out.usuals[0].start).toEqual({ kcal: 300, partial: false })
  })

  it('forage_get_usual answers one usual, and an unknown id is a tool error', async () => {
    api({ getUsual: ok(USUAL), getFoods: ok(FOODS) })
    expect(JSON.parse((await call('forage_get_usual', { id: 'us_1' })).content[0].text).id).toBe('us_1')
    api({ getUsual: () => ({ success: false, error: 'Usual "us_x" not found' }) })
    const r = await call('forage_get_usual', { id: 'us_x' })
    expect(r.isError).toBe(true)
  })

  it('forage_save_usual sends the payload, reports the usual and the undo call, and carries the reminder', async () => {
    const sent = api({ upsertUsual: ok(USUAL) })
    const lines = [{ food_id: 'fd_oats', qty: 0.5, unit: 'cup' }, { options: OPTIONS, last_pick: 'fd_bran' }]
    const r = await call('forage_save_usual', { name: 'Cereal', slot: 'After dinner', lines })
    expect(sent[0].payload).toMatchObject({ name: 'Cereal', slot: 'After dinner', lines })
    expect(sent[0].payload.call_id).toBeTruthy()
    expect(r.isError).toBeUndefined()
    expect(r.content[0].text).toContain('Saved usual Cereal (us_1) for After dinner: 2 lines.')
    expect(r.content[0].text).toContain(`Undo with forage_undo, call ${sent[0].payload.call_id}`)
    expect(r.content[0].text).toContain(REMINDER)
  })

  it('forage_save_usual says nothing was saved when the API refuses', async () => {
    api({ upsertUsual: () => ({ success: false, error: 'lines[1].qty must be greater than 0' }) })
    const r = await call('forage_save_usual', { name: 'x', slot: 'Snacks', lines: [{ food_id: 'fd_oats', unit: 'g', qty: 1 }] })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toBe('Nothing saved. lines[1].qty must be greater than 0')
  })

  it('forage_delete_usual deletes by id and says how to undo it', async () => {
    const sent = api({ deleteUsual: ok({ id: 'us_1', deleted: true }) })
    const r = await call('forage_delete_usual', { id: 'us_1' })
    expect(sent[0]).toMatchObject({ action: 'deleteUsual', payload: { id: 'us_1' } })
    expect(r.content[0].text).toContain('Deleted usual us_1 with its lines.')
    expect(r.content[0].text).toContain('forage_undo')
    expect(r.content[0].text).toContain(REMINDER)
  })

  it('forage_delete_food names a usual that uses the food', async () => {
    api({
      deleteFood: () => ({
        success: false,
        code: 'in_use',
        error: 'in use',
        uses: { recipes: [], trips: [], usuals: [{ id: 'us_1', name: 'Cereal' }] },
      }),
    })
    const r = await call('forage_delete_food', { id: 'fd_corn' })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toContain('usual Cereal (us_1)')
  })
})
