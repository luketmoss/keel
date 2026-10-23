import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import { fakeBudget } from '../../test/fake-budget'
import { handleThrive } from './index'

// #595: thrive_log_drink, thrive_update_drink and thrive_delete_drink, end to
// end through the Worker against a fake Apps Script API that keeps a Drinks log
// the way drinks.js does. The clock is pinned to 09:00 MDT on 2026-10-23.

const NOW = new Date('2026-10-23T15:00:00Z')
const REMINDER = "— Thrive (write) is on. Turn it off in Search and tools when you've finished writing."

type Drink = {
  id: string; kind: string; amount: string; date: string; time: string; logged_at_utc: string; source: string
}
type Req = { action: string; payload: any; params: URLSearchParams }

const drink = (o: Partial<Drink> & { id: string }): Drink => ({
  kind: 'water', amount: '118', date: '2026-10-22', time: '23:59:00',
  logged_at_utc: '2026-10-23T05:59:00.000Z', source: 'app', ...o,
})

const DENVER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})
function denver(iso: string) {
  const p = Object.fromEntries(DENVER.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` }
}

let store: Drink[]
let budget: ReturnType<typeof fakeBudget>
let env: Env

/** A fake Thrive API over `store`, recording every request. */
function fakeApi() {
  const requests: Req[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const action = url.searchParams.get('action') ?? ''
      const raw = url.searchParams.get('payload')
      const payload = raw ? JSON.parse(raw) : undefined
      requests.push({ action, payload, params: url.searchParams })
      const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }))
      const no = (error: string) => new Response(JSON.stringify({ success: false, error }))
      const find = (id: string) => store.find((d) => d.id === id)
      switch (action) {
        case 'getDrinks': {
          const from = url.searchParams.get('from')!
          const to = url.searchParams.get('to')!
          return ok({ drinks: store.filter((d) => d.date >= from && d.date <= to), water_goal_ml: 1893 })
        }
        case 'logDrink': {
          const d = { ...payload, amount: String(payload.amount), ...denver(payload.logged_at_utc) }
          delete d.call_id
          store.push(d)
          return ok(d)
        }
        case 'updateDrinkAmount': {
          const d = find(payload.id)
          if (!d) return no('No drink with that id')
          d.amount = String(payload.amount)
          return ok(d)
        }
        case 'updateDrinkTime': {
          const d = find(payload.id)
          if (!d) return no('No drink with that id')
          d.time = payload.time
          return ok(d)
        }
        case 'deleteDrink': {
          const d = find(payload.id)
          if (!d) return no('No drink with that id')
          store = store.filter((x) => x !== d)
          return ok(d)
        }
        default:
          return no(`unstubbed ${action}`)
      }
    }),
  )
  return requests
}

function rpc(method: string, params?: unknown): Request {
  return new Request('https://example.test/thrive/write/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
}

async function call(name: string, args: Record<string, unknown>, mode: 'read' | 'write' = 'write') {
  const res = await handleThrive(rpc('tools/call', { name, arguments: args }), env, mode)
  const json = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } }
  return { ...json.result, text: json.result.content[0].text }
}

const writes = (requests: Req[]) => requests.filter((r) => r.action !== 'getDrinks')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  store = []
  budget = fakeBudget()
  env = {
    THRIVE_API_URL: 'https://script.google.com/macros/s/thrive/exec',
    THRIVE_API_KEY: 'thrive-secret-key-123',
    WRITE_BUDGET: budget.namespace,
  } as Env
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('thrive_log_drink', () => {
  it("logs 16 oz yesterday at 22:00 as one mcp row at 22:00 Denver (MDT), with the day's totals", async () => {
    const requests = fakeApi()
    const r = await call('thrive_log_drink', { kind: 'water', amount_oz: 16, date: 'yesterday', time: '22:00' })
    expect(r.isError).toBeUndefined()
    const sent = writes(requests)
    expect(sent.map((q) => q.action)).toEqual(['logDrink'])
    const { id, call_id: callId, ...rest } = sent[0].payload
    expect(rest).toEqual({ kind: 'water', amount: 473, logged_at_utc: '2026-10-23T04:00:00.000Z', source: 'mcp' })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(callId).toMatch(/^[0-9a-f-]{36}$/)
    expect(store[0]).toMatchObject({ date: '2026-10-22', time: '22:00:00', amount: '473', source: 'mcp' })
    expect(r.text.split('\n').slice(0, 3)).toEqual([
      'Logged 16 oz (473 ml) of water on 2026-10-22 at 22:00.',
      '- 2026-10-22: water 16 oz (473 ml), 25% of goal · no coffee logged · no alcohol logged (1 entry)',
      `  - 22:00 water 16 oz (473 ml) [mcp] (${id})`,
    ])
    expect(r.text.endsWith(`\n\n${REMINDER}`)).toBe(true)
  })

  it('turns a winter (MST) local time into its UTC instant', async () => {
    const requests = fakeApi()
    await call('thrive_log_drink', { kind: 'water', amount_oz: 16, date: '2026-01-15', time: '22:00' })
    expect(writes(requests)[0].payload.logged_at_utc).toBe('2026-01-16T05:00:00.000Z')
    expect(store[0]).toMatchObject({ date: '2026-01-15', time: '22:00:00' })
  })

  it('defaults to 23:59 on a past date, to now on today, and to today with no date', async () => {
    const requests = fakeApi()
    await call('thrive_log_drink', { kind: 'coffee', date: '2026-10-20' })
    await call('thrive_log_drink', { kind: 'water', date: 'today' })
    await call('thrive_log_drink', { kind: 'water' })
    expect(writes(requests).map((q) => q.payload.logged_at_utc)).toEqual([
      '2026-10-21T05:59:00.000Z', '2026-10-23T15:00:00.000Z', '2026-10-23T15:00:00.000Z',
    ])
    expect(store.map((d) => `${d.date} ${d.time} ${d.kind} ${d.amount}`)).toEqual([
      '2026-10-20 23:59:00 coffee 1', '2026-10-23 09:00:00 water 118', '2026-10-23 09:00:00 water 118',
    ])
  })

  it('logs count entries as separate rows under one call id, counted as one write of that many rows', async () => {
    const requests = fakeApi()
    const r = await call('thrive_log_drink', { kind: 'alcohol', count: 3, date: '2026-10-22' })
    const sent = writes(requests)
    expect(sent).toHaveLength(3)
    expect(sent.every((q) => q.payload.amount === 1 && q.payload.kind === 'alcohol')).toBe(true)
    expect(new Set(sent.map((q) => q.payload.id)).size).toBe(3)
    expect(new Set(sent.map((q) => q.payload.call_id)).size).toBe(1)
    expect(budget.stored.thrive).toEqual([{ t: expect.any(Number), rows: 3 }])
    expect(r.text.split('\n').slice(0, 2)).toEqual([
      'Logged 3 alcohol drinks on 2026-10-22 at 23:59.',
      '- 2026-10-22: no water logged · no coffee logged · alcohol 3 drinks (3 entries)',
    ])
  })

  const refusals: [string, Record<string, unknown>, RegExp][] = [
    ['amount_oz on coffee', { kind: 'coffee', amount_oz: 8 }, /^Error: amount_oz is only for water: coffee and alcohol are always 1 per entry\. Use count to log several\.$/],
    ['amount_oz on alcohol', { kind: 'alcohol', amount_oz: 12 }, /^Error: amount_oz is only for water/],
    ['amount_oz of 0', { kind: 'water', amount_oz: 0 }, /amount_oz must be a whole number of ounces from 1 to 67/],
    ['amount_oz of 68', { kind: 'water', amount_oz: 68 }, /amount_oz must be a whole number/],
    ['fractional amount_oz', { kind: 'water', amount_oz: 8.5 }, /amount_oz must be a whole number/],
    ['count of 0', { kind: 'alcohol', count: 0 }, /count must be a whole number from 1 to 10/],
    ['count of 11', { kind: 'alcohol', count: 11 }, /count must be a whole number from 1 to 10/],
    ['a malformed time', { kind: 'water', time: '10pm' }, /time must be HH:MM/],
    ['a malformed date', { kind: 'water', date: 'last week' }, /date could not be read as a date: "last week"/],
    ['an impossible date', { kind: 'water', date: '2026-02-30' }, /date could not be read as a date/],
    ['a future date', { kind: 'water', date: 'tomorrow' }, /date 2026-10-24 is in the future/],
    ['a future time today', { kind: 'water', time: '09:01' }, /time 09:01 on 2026-10-23 is in the future/],
  ]
  for (const [label, args, message] of refusals) {
    it(`refuses ${label} before any request`, async () => {
      const requests = fakeApi()
      const r = await call('thrive_log_drink', args)
      expect(r.isError).toBe(true)
      expect(r.text).toMatch(message)
      expect(r.text).not.toContain(REMINDER)
      expect(requests).toEqual([])
      expect(budget.stored.thrive).toBeUndefined()
    })
  }
})

describe('thrive_update_drink', () => {
  beforeEach(() => {
    store = [drink({ id: 'w1' }), drink({ id: 'a1', kind: 'alcohol', amount: '1', time: '20:15:00' })]
  })

  it('changes amount and time, in the stated words, then the day line', async () => {
    const requests = fakeApi()
    const r = await call('thrive_update_drink', { id: 'w1', amount_oz: 16, time: '22:00' })
    expect(writes(requests).map((q) => [q.action, q.payload.amount ?? q.payload.time])).toEqual([
      ['updateDrinkAmount', 473], ['updateDrinkTime', '22:00:00'],
    ])
    expect(r.text.split('\n').slice(0, 2)).toEqual([
      'Updated the 2026-10-22 water entry (w1): 4 oz → 16 oz (473 ml), 23:59 → 22:00.',
      '- 2026-10-22: water 16 oz (473 ml), 25% of goal · no coffee logged · alcohol 1 drink (2 entries)',
    ])
    expect(r.text.endsWith(REMINDER)).toBe(true)
  })

  it("changes any entry's time", async () => {
    const requests = fakeApi()
    const r = await call('thrive_update_drink', { id: 'a1', time: '21:30' })
    expect(writes(requests).map((q) => q.action)).toEqual(['updateDrinkTime'])
    expect(r.text).toMatch(/^Updated the 2026-10-22 alcohol entry \(a1\): 20:15 → 21:30\./)
  })

  it('sends nothing for a value equal to the stored one', async () => {
    const requests = fakeApi()
    const same = await call('thrive_update_drink', { id: 'w1', amount_oz: 4, time: '23:59' })
    expect(writes(requests)).toEqual([])
    expect(same.text).toMatch(/^Nothing to change/)
    expect(same.text).not.toContain(REMINDER)
    await call('thrive_update_drink', { id: 'w1', amount_oz: 4, time: '22:00' })
    expect(writes(requests).map((q) => q.action)).toEqual(['updateDrinkTime'])
  })

  it('refuses amount_oz on a non-water entry, an unknown id, and a call with neither field', async () => {
    const requests = fakeApi()
    const coffee = await call('thrive_update_drink', { id: 'a1', amount_oz: 2 })
    expect(coffee.isError).toBe(true)
    expect(coffee.text).toMatch(/amount_oz is only for water/)
    const unknown = await call('thrive_update_drink', { id: 'nope', time: '22:00' })
    expect(unknown.isError).toBe(true)
    expect(unknown.text).toMatch(/id "nope" is not a drink logged in the last 400 days/)
    const neither = await call('thrive_update_drink', { id: 'w1' })
    expect(neither.isError).toBe(true)
    expect(neither.text).toMatch(/Give amount_oz, time or both/)
    expect(writes(requests)).toEqual([])
    expect(budget.stored.thrive).toBeUndefined()
  })

  it('looks the id up over the last 400 days ending today', async () => {
    const requests = fakeApi()
    await call('thrive_update_drink', { id: 'w1', time: '22:00' })
    const read = requests.find((q) => q.action === 'getDrinks')!
    expect([read.params.get('from'), read.params.get('to')]).toEqual(['2025-09-19', '2026-10-23'])
  })
})

describe('thrive_delete_drink', () => {
  beforeEach(() => {
    store = [drink({ id: 'w1' }), drink({ id: 'a1', kind: 'alcohol', amount: '1', time: '20:15:00' })]
  })

  it('without confirm, reports the entry, writes nothing and counts nothing', async () => {
    const requests = fakeApi()
    const r = await call('thrive_delete_drink', { id: 'a1' })
    expect(r.text).toBe(
      'DRY RUN — nothing deleted. This would remove:\n- 2026-10-22 20:15 alcohol 1 drink [app] (a1)\n\n' +
        'Call again with confirm: true to delete.',
    )
    expect(writes(requests)).toEqual([])
    expect(budget.stored.thrive).toBeUndefined()
    expect(store).toHaveLength(2)
  })

  it('with confirm: true, deletes it and gives the day line', async () => {
    const requests = fakeApi()
    const r = await call('thrive_delete_drink', { id: 'a1', confirm: true })
    expect(writes(requests).map((q) => [q.action, q.payload.id])).toEqual([['deleteDrink', 'a1']])
    expect(r.text.split('\n').slice(0, 2)).toEqual([
      'Deleted 2026-10-22 20:15 alcohol 1 drink [app] (a1).',
      '- 2026-10-22: water 4 oz (118 ml), 6% of goal · no coffee logged · no alcohol logged (1 entry)',
    ])
    expect(r.text.endsWith(REMINDER)).toBe(true)
    expect(budget.stored.thrive).toHaveLength(1)
  })

  it('refuses an unknown id', async () => {
    const requests = fakeApi()
    const r = await call('thrive_delete_drink', { id: 'nope', confirm: true })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/id "nope" is not a drink logged/)
    expect(writes(requests)).toEqual([])
  })
})

describe('thrive_drinks (#595)', () => {
  it('shows each entry with its id, and narrates an MCP-logged drink as [mcp]', async () => {
    store = [drink({ id: 'w1' }), drink({ id: 'm1', source: 'mcp', time: '22:00:00', amount: '473' })]
    fakeApi()
    const r = await call('thrive_drinks', { date_from: '2026-10-22', date_to: '2026-10-22' }, 'read')
    expect(r.text).toContain('  - 23:59 water 4 oz (118 ml) [app] (w1)')
    expect(r.text).toContain('  - 22:00 water 16 oz (473 ml) [mcp] (m1)')
  })
})
