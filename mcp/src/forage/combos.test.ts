import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import { fakeBudget } from '../../test/fake-budget'
import { handleForage } from './index'
import { FORAGE_READ_TOOLS } from './tools'

// #879: the combo tools over a fake Forage API. The detection is tested in
// forage/apps-script/tests/combos.test.ts.

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
  { id: 'fd_bread', name: 'Bread', brand: '' },
  { id: 'fd_turkey', name: 'Turkey', brand: 'Boar\'s Head' },
  { id: 'fd_ched', name: 'Cheddar', brand: '' },
  { id: 'fd_swiss', name: 'Swiss', brand: '' },
]
const STATS = { meals: 20, sets: 30, kept: 5, after_inner: 4, joined: 3, covered: 1, hidden: 0, returned: 2 }
const COMBOS = {
  combos: [
    {
      key: 'fd_bread+fd_turkey|fd_ched/fd_swiss',
      name: 'Bread + Turkey + Cheddar / Swiss',
      slot: 'Lunch',
      meals: 7,
      last_date: '2026-11-13',
      lines: [
        { food_id: 'fd_bread', qty: 2, unit: 'slice' },
        { food_id: 'fd_turkey', qty: 3, unit: 'oz' },
        {
          options: [
            { food_id: 'fd_ched', qty: 1, unit: 'slice' },
            { food_id: 'fd_swiss', qty: 1, unit: 'slice' },
          ],
          default: 'fd_swiss',
        },
      ],
      meal_dates: [{ date: '2026-11-13', slot: 'Lunch' }],
    },
  ],
  stats: STATS,
}

describe('forage_list_combos', () => {
  it('is a read tool and forage_hide_combo a write tool', () => {
    expect(FORAGE_READ_TOOLS.has('forage_list_combos')).toBe(true)
    expect(FORAGE_READ_TOOLS.has('forage_hide_combo')).toBe(false)
  })

  it('asks for the filters, names every food and carries the stats', async () => {
    const sent = api({ getCombos: ok(COMBOS), getFoods: ok(FOODS) })
    const r = await call('forage_list_combos', { slot: 'Lunch', days: 30, limit: 5 })
    expect(r.isError).toBeUndefined()
    const asked = sent.find((s) => s.action === 'getCombos')!
    expect(asked.params.get('slot')).toBe('Lunch')
    expect(asked.params.get('days')).toBe('30')
    expect(asked.params.get('limit')).toBe('5')
    const out = JSON.parse(text(r))
    expect(out.count).toBe(1)
    expect(out.stats).toEqual(STATS)
    const c = out.combos[0]
    expect(c.key).toBe('fd_bread+fd_turkey|fd_ched/fd_swiss')
    expect(c.lines[1]).toEqual({ food_id: 'fd_turkey', food_name: "Boar's Head Turkey", qty: 3, unit: 'oz' })
    expect(c.lines[2].pick_one.map((o: any) => o.food_name)).toEqual(['Cheddar', 'Swiss'])
    expect(c.lines[2].default).toEqual({ food_id: 'fd_swiss', food_name: 'Swiss' })
    expect(r.content[0].text).not.toContain(REMINDER)
  })

  it('sends only what it was given and says so when the API refuses', async () => {
    const sent = api({ getCombos: () => ({ success: false, error: 'days must be at least 1' }) })
    const r = await call('forage_list_combos', {})
    expect(sent[0].params.has('slot')).toBe(false)
    expect(sent[0].params.has('days')).toBe(false)
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('days must be at least 1')
  })
})

describe('forage_hide_combo', () => {
  it('hides a key, names the undo call and carries the reminder', async () => {
    const sent = api({ hideCombo: ok({ hidden: ['fd_a+fd_b'] }) })
    const r = await call('forage_hide_combo', { key: 'fd_a+fd_b' })
    const s = sent.find((x) => x.action === 'hideCombo')!
    expect(s.payload).toMatchObject({ key: 'fd_a+fd_b' })
    expect(s.payload.call_id).toEqual(expect.any(String))
    expect(text(r)).toContain('Hid combo fd_a+fd_b')
    expect(text(r)).toContain(`Undo with forage_undo, call ${s.payload.call_id}`)
    expect(text(r)).toContain(REMINDER)
  })

  it('refuses to hide without a key, sending nothing', async () => {
    const sent = api({})
    const r = await call('forage_hide_combo', {})
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('key is required')
    expect(sent).toHaveLength(0)
  })

  it('unhide: true with keys shows those, and with none shows every one', async () => {
    const sent = api({ unhideCombos: ok({ hidden: [] }) })
    const some = await call('forage_hide_combo', { unhide: true, keys: ['fd_a+fd_b'] })
    expect(sent[0].action).toBe('unhideCombos')
    expect(sent[0].payload).toMatchObject({ keys: ['fd_a+fd_b'] })
    expect(text(some)).toContain('Showed 1 combo again')
    const all = await call('forage_hide_combo', { unhide: true })
    expect(sent[1].payload.keys).toBeUndefined()
    expect(text(all)).toContain('Showed every hidden combo again')
    expect(text(all)).toContain('Nothing is hidden.')
  })

  it('reports a refusal as nothing changed, without the reminder', async () => {
    api({ hideCombo: () => ({ success: false, error: 'key is required' }) })
    const r = await call('forage_hide_combo', { key: 'x' })
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('Nothing changed. key is required')
    expect(text(r)).not.toContain(REMINDER)
  })
})
