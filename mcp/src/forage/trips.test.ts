import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import { fakeBudget } from '../../test/fake-budget'
import { handleForage } from './index'
import { FORAGE_READ_TOOLS } from './tools'

// #718: the five trip tools, and #719's two plus `buy`, over a fake Forage API, with the wording of
// forage/docs/design/718-shopping-trips.md. The API's own rules (building, the
// need, defaults, stale lines, undo) are in forage/apps-script/tests/trips.test.ts.

const KEY = 'forage-key'
const URL_ = 'https://script.google.com/macros/s/forage/exec'
// 11:00 on Monday 2 November in Denver.
const NOW = Date.UTC(2026, 10, 2, 18)
const REMINDER = "— Forage (write) is on. Turn it off in Search and tools when you've finished writing."

let budget = fakeBudget({ now: NOW })
const env = () => ({ FORAGE_API_URL: URL_, FORAGE_API_KEY: KEY, WRITE_BUDGET: budget.namespace }) as Env

type Result = { content: { text: string }[]; isError?: boolean }
type Sent = { action: string; payload: any; params: URLSearchParams }

function rpc(method: string, params?: unknown): Request {
  return new Request('https://example.test/forage/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
}

async function call(name: string, args: Record<string, unknown> = {}): Promise<Result> {
  const mode = FORAGE_READ_TOOLS.has(name) ? 'read' : 'write'
  const res = await handleForage(rpc('tools/call', { name, arguments: args }), env(), mode)
  return ((await res.json()) as { result: Result }).result
}

async function listTools(mode: 'read' | 'write') {
  const res = await handleForage(rpc('tools/list'), env(), mode)
  return ((await res.json()) as { result: { tools: { name: string; description: string; annotations: any; inputSchema: any }[] } })
    .result.tools
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
const textOf = (r: Result) => r.content[0].text

const line = (plan_id: string, recipe_name: string) => ({ plan_id, recipe_name, date: '', slot: 'Dinner', line_id: 'L1', text: '', amt: '' })

function item(over: Record<string, unknown>) {
  return { food_id: 'fd_1', name: 'Food', category: '', choice: '', suggested: false, bought: false, buy: '', mine: false, need: null, lines: [], ...over }
}

const TRIP = {
  id: 'tr_01020304',
  status: 'open',
  through: '2026-11-06',
  created: 'x',
  closed_at: '',
  meals: [
    { plan_id: 'pl_5d6e7f8a', date: '2026-11-04', slot: 'Dinner', recipe_id: 'rc_chili', recipe_name: 'Weeknight chili' },
    { plan_id: 'pl_9a8b7c6d', date: '2026-11-06', slot: 'Dinner', recipe_id: 'rc_stew', recipe_name: 'Beef Stew' },
  ],
  items: [
    item({ food_id: 'fd_1a2b3c4d', name: 'Cilantro', need: '1 bunch', lines: [line('pl_5d6e7f8a', 'Weeknight chili')] }),
    item({
      food_id: 'fd_0a1b2c3d',
      name: 'Yellow onion',
      choice: 'ks',
      bought: true,
      need: 'about 3 onions',
      lines: [line('pl_5d6e7f8a', 'Weeknight chili'), line('pl_9a8b7c6d', 'Beef Stew')],
    }),
    item({ food_id: 'fd_feta', name: 'Feta', choice: 'costco', suggested: true, need: '4 oz', lines: [line('pl_9a8b7c6d', 'Beef Stew')] }),
    item({ food_id: 'fd_5e6f7a8b', name: 'Olive oil', choice: 'have', suggested: true, need: '2 tbsp + 1 tbsp', lines: [line('pl_5d6e7f8a', 'Weeknight chili')] }),
  ],
  counts: { all: 4, todo: 1, have: 1, ks: 1, costco: 1, other: 0, to_buy: 2, bought: 1 },
  unmatched: [{ plan_id: 'pl_9a8b7c6d', recipe_name: 'Beef Stew', line_id: 'L9', text: '1 bay leaf' }],
}

describe('the trip tools', () => {
  it('are registered: forage_get_trip is read; discard carries destructiveHint; the rest are plain writes', async () => {
    const read = (await listTools('read')).map((t) => t.name)
    const write = Object.fromEntries((await listTools('write')).map((t) => [t.name, t]))
    expect(read).toContain('forage_get_trip')
    expect(FORAGE_READ_TOOLS.has('forage_get_trip')).toBe(true)
    for (const name of ['forage_start_trip', 'forage_set_trip_item', 'forage_close_trip']) {
      expect(write[name].annotations, name).toMatchObject({ readOnlyHint: false, destructiveHint: false })
    }
    expect(write.forage_discard_trip.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true })
    expect(write.forage_start_trip.description).toBe(
      'Starts a shopping trip for planned recipe meals after today through a date. Previews first. One trip can be open at a time.',
    )
    expect(Object.keys(write.forage_set_trip_item.inputSchema.properties).sort()).toEqual(['bought', 'buy', 'choice', 'food_id', 'trip_id'])
    expect(Object.keys(write.forage_discard_trip.inputSchema.properties).sort()).toEqual(['confirm', 'trip_id'])
  })
})

describe('forage_get_trip', () => {
  it('reads the open trip, grouped by choice, with no reminder', async () => {
    const sent = api({ getTrip: ok({ trip: TRIP }) })
    const r = await call('forage_get_trip')
    expect(r.isError).toBeUndefined()
    expect(sent.map((s) => [s.action, s.params.get('id'), s.params.get('call_id')])).toEqual([['getTrip', null, null]])
    expect(textOf(r).split('\n')).toEqual([
      'Trip tr_01020304 · open · through Fri 2026-11-06 · 2 meals',
      '  Weeknight chili · Wed 2026-11-04 Dinner (pl_5d6e7f8a)',
      '  Beef Stew · Fri 2026-11-06 Dinner (pl_9a8b7c6d)',
      '4 items: 1 to sort, 1 have, 1 King Soopers (1 bought), 1 Costco.',
      '',
      'To sort',
      '  fd_1a2b3c4d  Cilantro · 1 bunch · Weeknight chili',
      'King Soopers',
      '  fd_0a1b2c3d  Yellow onion · about 3 onions · Weeknight chili, Beef Stew · bought',
      'Costco',
      '  fd_feta  Feta · 4 oz · Beef Stew · suggested',
      'Have it',
      '  fd_5e6f7a8b  Olive oil · 2 tbsp + 1 tbsp · Weeknight chili · suggested',
      '',
      'Not on the list (not matched to a food): "1 bay leaf" in Beef Stew',
    ])
    expect(textOf(r)).not.toContain(REMINDER)
  })

  it('with no open trip says the last one, or that there are none', async () => {
    api({
      getTrip: ok({ trip: null }),
      getTrips: ok([{ id: 'tr_old', status: 'closed', closed_at: '2026-10-27T01:00:00.000Z', items: 19, bought: 17, stores: ['ks'] }]),
    })
    // 01:00 UTC on the 27th is still the 26th in Denver.
    expect(textOf(await call('forage_get_trip'))).toBe('No open trip. Last trip: closed Mon 2026-10-26, 19 items, 17 bought.')
    api({ getTrip: ok({ trip: null }), getTrips: ok([]) })
    expect(textOf(await call('forage_get_trip'))).toBe('No open trip. No trips yet.')
  })

  it('reads a named trip by id', async () => {
    const sent = api({ getTrip: ok({ trip: { ...TRIP, status: 'closed' } }) })
    const r = await call('forage_get_trip', { trip_id: 'tr_01020304' })
    expect(sent[0].params.get('id')).toBe('tr_01020304')
    expect(textOf(r).split('\n')[0]).toBe('Trip tr_01020304 · closed · through Fri 2026-11-06 · 2 meals')
  })
})

describe('forage_start_trip', () => {
  const preview = (r: Sent) => ({ success: true, data: { trip: { ...TRIP, id: 'tr_new', counts: { ...TRIP.counts, ks: 1, to_buy: 2 } }, written: r.payload.dry_run !== true, dry_run: r.payload.dry_run === true } })

  it('previews by default with dry_run true, sending no write and no reminder', async () => {
    const sent = api({ startTrip: preview })
    const r = await call('forage_start_trip', { through: '+4d' })
    expect(sent.map((s) => [s.action, s.payload])).toEqual([
      ['startTrip', { through: '2026-11-06', today: '2026-11-02', dry_run: true }],
    ])
    expect(textOf(r).split('\n')).toEqual([
      'Preview — nothing saved.',
      'Trip through Fri 2026-11-06, 2 meals: Weeknight chili (Wed), Beef Stew (Fri).',
      '4 items: 1 start as Have it, 2 at their usual store, 1 to sort.',
      'Not on the list (not matched to a food): "1 bay leaf" in Beef Stew',
      'Call again with dry_run: false to start it.',
    ])
    expect(textOf(r)).not.toContain(REMINDER)
  })

  it('starts it with dry_run: false, with plan_ids, a call id and the reminder', async () => {
    const sent = api({ startTrip: preview })
    const r = await call('forage_start_trip', { through: '2026-11-06', plan_ids: ['pl_5d6e7f8a'], dry_run: false })
    expect(sent.map((s) => s.payload.dry_run)).toEqual([true, false])
    expect(sent[1].payload).toMatchObject({ through: '2026-11-06', plan_ids: ['pl_5d6e7f8a'], dry_run: false })
    expect(sent[1].payload.call_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(sent[0].payload.call_id).toBeUndefined()
    const lines = textOf(r).split('\n')
    expect(lines[0]).toBe('Started trip tr_new through Fri 2026-11-06 with 2 meals and 4 items (1 to sort).')
    expect(lines[1]).toBe(`Undo with forage_undo, call ${sent[1].payload.call_id}`)
    expect(textOf(r)).toContain(REMINDER)
  })

  it('a refusal says Nothing saved, then one line per meal, and writes nothing', async () => {
    const sent = api({
      startTrip: () => ({
        success: false,
        code: 'ineligible',
        error: 'pl_1 is a note, not a recipe meal. pl_2 is already on trip tr_9.',
        problems: [
          { plan_id: 'pl_1', error: 'pl_1 is a note, not a recipe meal.' },
          { plan_id: 'pl_2', error: 'pl_2 is already on trip tr_9.' },
        ],
      }),
    })
    const r = await call('forage_start_trip', { through: 'tomorrow', plan_ids: ['pl_1', 'pl_2'], dry_run: false })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toBe('Nothing saved.\npl_1 is a note, not a recipe meal.\npl_2 is already on trip tr_9.')
    expect(sent).toHaveLength(1)
    api({ startTrip: () => ({ success: false, code: 'trip_open', error: 'A trip is already open (tr_01020304). Close it or throw it away first.' }) })
    expect(textOf(await call('forage_start_trip', { through: '+5d' }))).toBe(
      'Nothing saved.\nA trip is already open (tr_01020304). Close it or throw it away first.',
    )
  })

  it('refuses an unreadable date before any request', async () => {
    const sent = api({})
    expect(textOf(await call('forage_start_trip', { through: 'soon' }))).toBe(
      `Nothing saved. Could not read "soon" as a date — use YYYY-MM-DD, 'today', 'tomorrow' or '+3d'.`,
    )
    expect(sent).toEqual([])
  })
})

describe('forage_set_trip_item', () => {
  it('saves a choice, says it will be suggested next time when remembered, then the reminder', async () => {
    const sent = api({
      setTripItem: ok({ item: item({ name: 'Yellow onion', choice: 'ks' }), remembered: true }),
    })
    const r = await call('forage_set_trip_item', { food_id: 'fd_0a1b2c3d', choice: 'ks' })
    expect(sent[0].payload).toMatchObject({ food_id: 'fd_0a1b2c3d', choice: 'ks' })
    expect(textOf(r).split('\n')[0]).toBe('Yellow onion: King Soopers, not bought. Forage will suggest King Soopers next time.')
    expect(textOf(r)).toContain(REMINDER)
    api({ setTripItem: ok({ item: item({ name: 'Olive oil', choice: 'have' }) }) })
    expect(textOf(await call('forage_set_trip_item', { food_id: 'fd_5e6f7a8b', choice: 'have' })).split('\n')[0]).toBe(
      'Olive oil: Have it.',
    )
  })

  it('passes refusals on after Nothing changed, with no reminder; neither field is refused before sending', async () => {
    api({ setTripItem: () => ({ success: false, code: 'not_on_trip', error: "Yellow onion isn't on trip tr_01020304." }) })
    const r = await call('forage_set_trip_item', { food_id: 'fd_0a1b2c3d', bought: true })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toBe("Nothing changed. Yellow onion isn't on trip tr_01020304.")
    const sent = api({})
    expect(textOf(await call('forage_set_trip_item', { food_id: 'fd_1' }))).toBe('Send choice, bought or buy. Nothing changed.')
    expect(sent).toEqual([])
  })
})

describe('forage_close_trip', () => {
  it("says what was bought and what wasn't, and that the meals read as shopped", async () => {
    const sent = api({ closeTrip: ok({ trip: { ...TRIP, status: 'closed' } }) })
    const r = await call('forage_close_trip')
    expect(sent[0].payload).toMatchObject({})
    expect(sent[0].payload.trip_id).toBeUndefined()
    expect(textOf(r).split('\n')[0]).toBe(
      'Closed trip tr_01020304: 1 of 2 bought. Not bought: Feta (Costco). Its 2 meals now read as shopped.',
    )
    expect(textOf(r)).toContain(REMINDER)
  })
})

describe('forage_discard_trip', () => {
  it('previews unless confirm: true, with no write', async () => {
    const sent = api({ getTrip: ok({ trip: TRIP }) })
    const r = await call('forage_discard_trip')
    expect(sent.map((s) => s.action)).toEqual(['getTrip'])
    expect(textOf(r)).toBe(
      'Would throw away trip tr_01020304: 4 items, 2 meals go back to planned with no trip. Call again with confirm: true.',
    )
  })

  it('throws it away with confirm: true, with the undo line and the reminder', async () => {
    const sent = api({ getTrip: ok({ trip: TRIP }), discardTrip: ok({ discarded: 'tr_01020304', meals_cleared: 2 }) })
    const r = await call('forage_discard_trip', { confirm: true })
    expect(sent.map((s) => s.action)).toEqual(['getTrip', 'discardTrip'])
    expect(sent[1].payload.trip_id).toBe('tr_01020304')
    const lines = textOf(r).split('\n')
    expect(lines[0]).toBe('Threw away trip tr_01020304. 2 meals are planned with no trip.')
    expect(lines[1]).toBe(`Undo with forage_undo, call ${sent[1].payload.call_id}`)
    expect(textOf(r)).toContain(REMINDER)
  })

  it('refuses a closed trip, and says when none is open', async () => {
    const sent = api({ getTrip: ok({ trip: { ...TRIP, status: 'closed' } }) })
    expect(textOf(await call('forage_discard_trip', { trip_id: 'tr_01020304', confirm: true }))).toBe(
      'Nothing changed. Trip tr_01020304 is closed; only an open trip can be thrown away.',
    )
    expect(sent.map((s) => s.action)).toEqual(['getTrip'])
    api({ getTrip: ok({ trip: null }) })
    expect(textOf(await call('forage_discard_trip'))).toBe('Nothing changed. No shopping trip is open.')
  })
})

// ---------------------------------------------------------------- #719

describe('#719: forage_add_to_trip, forage_remove_from_trip and buy', () => {
  const added = (over: Record<string, unknown>) => ({ trip: TRIP, added: [], joined: [], meals: [], food: null, ...over })
  const withItem = (i: Record<string, unknown>) => ({ ...TRIP, items: [...TRIP.items, item(i)] })

  it("are plain write tools with the design note's descriptions", async () => {
    const write = Object.fromEntries((await listTools('write')).map((t) => [t.name, t]))
    expect(write.forage_add_to_trip.description).toBe(
      'Adds a food, a new item by name, or the meals planned since the list was made to the open shopping trip. ' +
        'A new name becomes a food with no nutrition.',
    )
    expect(write.forage_remove_from_trip.description).toBe(
      "Takes an item you added off the open trip. Items needed by planned meals can't be removed.",
    )
    for (const name of ['forage_add_to_trip', 'forage_remove_from_trip']) {
      expect(FORAGE_READ_TOOLS.has(name)).toBe(false)
      expect(write[name].annotations, name).toMatchObject({ readOnlyHint: false, destructiveHint: false })
    }
    expect(write.forage_set_trip_item.inputSchema.properties.buy.description).toBe(
      "What you are buying, as free text, for example '18 pack'. Empty clears it.",
    )
  })

  it('adds a food: its store and buying amount, its id, the undo line and the reminder', async () => {
    const sent = api({
      addToTrip: ok(
        added({
          added: ['fd_1a2b3c4d'],
          food: { id: 'fd_1a2b3c4d', name: 'Milk', created: false, matched_existing: false },
          trip: withItem({ food_id: 'fd_1a2b3c4d', name: 'Milk', choice: 'ks', suggested: true, buy: '1 gallon', mine: true }),
        }),
      ),
    })
    const r = await call('forage_add_to_trip', { food_id: 'fd_1a2b3c4d' })
    expect(sent[0].payload).toMatchObject({ food_id: 'fd_1a2b3c4d', today: '2026-11-02' })
    expect(sent[0].payload.call_id).toMatch(/^[0-9a-f-]{36}$/)
    const lines = textOf(r).split('\n')
    expect(lines[0]).toBe('Added Milk to the list: King Soopers, 1 gallon. (fd_1a2b3c4d)')
    expect(lines[1]).toBe(`Undo with forage_undo, call ${sent[0].payload.call_id}`)
    expect(textOf(r)).toContain(REMINDER)
  })

  it('a new item by name, one already on the list, and late meals each get their line', async () => {
    api({
      addToTrip: ok(
        added({
          added: ['fd_new'],
          food: { id: 'fd_new', name: 'Paper towels', created: true, matched_existing: false },
          trip: withItem({ food_id: 'fd_new', name: 'Paper towels', mine: true }),
        }),
      ),
    })
    expect(textOf(await call('forage_add_to_trip', { text: 'paper towels' })).split('\n')[0]).toBe(
      'Added Paper towels, a new item. It needs a store.',
    )
    api({ addToTrip: ok(added({ food: { id: 'fd_1a2b3c4d', name: 'Cilantro', created: false, matched_existing: true } })) })
    const again = await call('forage_add_to_trip', { text: 'cilantro' })
    expect(textOf(again).split('\n')[0]).toBe('Cilantro is already on the list.')
    expect(textOf(again)).not.toContain('Undo with')

    const sent = api({
      addToTrip: ok(
        added({
          meals: ['pl_1', 'pl_2'],
          added: ['fd_a', 'fd_b', 'fd_c'],
          joined: ['fd_0a1b2c3d', 'fd_feta'],
          trip: {
            ...TRIP,
            items: [
              ...TRIP.items,
              item({ food_id: 'fd_a' }),
              item({ food_id: 'fd_b', choice: 'ks' }),
              item({ food_id: 'fd_c', choice: 'have' }),
            ],
          },
        }),
      ),
    })
    const late = await call('forage_add_to_trip', { late_meals: true })
    expect(sent[0].payload).toMatchObject({ late_meals: true, today: '2026-11-02' })
    expect(textOf(late).split('\n')[0]).toBe("Added 2 meals' items: 3 new, more of 2 already on the list. 1 item needs a store.")
    api({ addToTrip: ok(added({ meals: ['pl_1'] })) })
    expect(textOf(await call('forage_add_to_trip', { late_meals: true })).split('\n')[0]).toBe(
      'Added 1 meal to the trip. It needs nothing new on the list.',
    )
  })

  it('refuses none or two of the inputs before sending; passes API refusals on after Nothing changed', async () => {
    const sent = api({})
    for (const args of [{}, { food_id: 'fd_1', text: 'milk' }]) {
      const r = await call('forage_add_to_trip', args)
      expect(r.isError).toBe(true)
      expect(textOf(r)).toBe('Nothing changed. Give one of food_id, text or late_meals.')
    }
    expect(sent).toEqual([])
    api({ addToTrip: () => ({ success: false, code: 'no_open_trip', error: 'No shopping trip is open.' }) })
    expect(textOf(await call('forage_add_to_trip', { text: 'milk' }))).toBe('Nothing changed. No shopping trip is open.')
  })

  it('removes an added item; a meal item is refused naming its meals', async () => {
    const sent = api({ removeTripItem: ok({ removed: 'fd_new', name: 'Paper towels', trip: TRIP }) })
    const r = await call('forage_remove_from_trip', { food_id: 'fd_new' })
    expect(sent[0].payload).toMatchObject({ food_id: 'fd_new' })
    expect(textOf(r).split('\n')[0]).toBe('Took Paper towels off the list.')
    expect(textOf(r)).toContain(REMINDER)
    api({
      removeTripItem: () => ({ success: false, code: 'has_meals', error: 'Onions is on the list for 2 planned meals.' }),
    })
    expect(textOf(await call('forage_remove_from_trip', { food_id: 'fd_0a1b2c3d' }))).toBe(
      'Nothing changed. Onions is on the list for 2 planned meals.',
    )
  })

  it('buy on forage_set_trip_item is sent and its saved line gains the buy', async () => {
    const sent = api({ setTripItem: ok({ item: item({ name: 'Eggs', choice: 'ks', buy: '18 pack' }) }) })
    const r = await call('forage_set_trip_item', { food_id: 'fd_eggs', buy: '18 pack' })
    expect(sent[0].payload).toMatchObject({ food_id: 'fd_eggs', buy: '18 pack' })
    expect(sent[0].payload.choice).toBeUndefined()
    expect(textOf(r).split('\n')[0]).toBe('Eggs: King Soopers, not bought, buying 18 pack.')
  })

  it('forage_get_trip shows added items, buying amounts and the late meals', async () => {
    const sent = api({
      getTrip: ok({
        trip: {
          ...withItem({ food_id: 'fd_tw', name: 'Paper towels', mine: true, buy: '6 rolls' }),
          late_meals: [{ plan_id: 'pl_thu', recipe_name: 'Beef Stew', date: '2026-11-05', slot: 'Dinner' }],
        },
      }),
    })
    const lines = textOf(await call('forage_get_trip')).split('\n')
    expect(sent[0].params.get('today')).toBe('2026-11-02')
    expect(lines).toContain('  fd_tw  Paper towels · added by you · buying 6 rolls')
    expect(lines[lines.length - 1]).toBe(
      'Planned since the list was made: Beef Stew (Thu 2026-11-05 Dinner, pl_thu). Add them with forage_add_to_trip late_meals: true.',
    )
  })
})
