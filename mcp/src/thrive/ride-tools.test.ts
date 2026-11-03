import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import golden from '../../test/fixtures/ride-steps-golden.json'
import type { Env } from '../env'
import { fakeBudget } from '../../test/fake-budget'
import { handleThrive } from './index'

// #774: the seven Thrive Spin tools, end to end through the Worker against a fake Apps Script API that
// keeps the RideWorkouts and FtpHistory tabs the way #765's actions do. The clock is pinned to
// 2026-11-03 at 09:00 Denver.

const NOW = new Date('2026-11-03T16:00:00Z')
const REMINDER = "— Thrive (write) is on. Turn it off in Search and tools when you've finished writing."
const READ = ['thrive_list_ride_workouts', 'thrive_get_ride_workout', 'thrive_ftp']

type Workout = {
  id: string; name: string; category: string; description: string; steps: any; duration_s: string
  created: string; updated: string; last_ridden_date: string
}
type Ftp = { id: string; date: string; ftp_w: string; source: string; ride_id: string; created: string }
type Req = { action: string; payload: any; params: URLSearchParams }

const EXAMPLE = golden.valid[0].steps as { v: number; steps: any[] }

const workout = (o: Partial<Workout> = {}): Workout => ({
  id: 'rw_1a2b3c4d', name: 'Sweet Spot 3x12', category: 'Sweet spot', description: 'Three blocks.', steps: EXAMPLE,
  duration_s: '4440', created: '2026-10-01T00:00:00.000Z', updated: '2026-10-01T00:00:00.000Z',
  last_ridden_date: '2026-11-01', ...o,
})
const ftp = (o: Partial<Ftp> = {}): Ftp => ({
  id: 'f1', date: '2026-03-02', ftp_w: '240', source: 'ramp_test', ride_id: 'ride-9', created: '2026-03-02T18:00:00.000Z', ...o,
})

/** A 75-minute sweet-spot workout: a warm-up ramp, two repeat blocks and a cool-down. */
const SWEET_SPOT_75 = [
  { label: 'Warm-up', dur_s: 600, mode: 'erg', pct: 50, pct_end: 70 },
  { repeat: 2, steps: [{ label: 'Sweet spot', dur_s: 900, mode: 'erg', pct: 90, cadence: 90 }, { label: 'Recover', dur_s: 300, mode: 'erg', pct: 55 }] },
  { repeat: 2, steps: [{ label: 'Sweet spot', dur_s: 400, mode: 'erg', pct: 92 }, { label: 'Recover', dur_s: 200, mode: 'erg', pct: 55 }] },
  { label: 'Cool-down', dur_s: 300, mode: 'resistance', level: 20 },
]
// 600 + 2 x 1200 + 2 x 600 + 300 = 4500 s = 1:15:00.

let library: Workout[]
let history: Ftp[]
let budget: ReturnType<typeof fakeBudget>
let env: Env
let oldApi = false

/** A fake Thrive API over `library` and `history`, recording every request. */
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
      if (oldApi) return no(`Unknown action: "${action}"`)
      switch (action) {
        case 'getRideWorkouts':
          return ok(library)
        case 'saveRideWorkout': {
          const total = (blocks: any[]) =>
            blocks.reduce((sum, b) => sum + (b.repeat ? b.repeat * b.steps.reduce((x: number, s: any) => x + s.dur_s, 0) : b.dur_s), 0)
          const found = payload.id ? library.find((w) => w.id === payload.id) : undefined
          const saved = workout({
            id: payload.id ?? 'rw_new00001', name: payload.name, category: payload.category,
            description: payload.description ?? '', steps: payload.steps, duration_s: String(total(payload.steps.steps)),
            last_ridden_date: found?.last_ridden_date ?? '',
          })
          library = found ? library.map((w) => (w === found ? saved : w)) : [...library, saved]
          return ok(saved)
        }
        case 'deleteRideWorkout': {
          const found = library.find((w) => w.id === payload.id)
          library = library.filter((w) => w !== found)
          return ok({ id: payload.id, deleted: !!found })
        }
        case 'getFtp':
          return ok({ current: history[0] ?? null, history })
        case 'addFtp': {
          const row = { ...payload, ftp_w: String(payload.ftp_w), ride_id: payload.ride_id ?? '', created: NOW.toISOString() }
          delete row.call_id
          history = [row, ...history]
          return ok(row)
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

async function call(name: string, args: Record<string, unknown> = {}) {
  const mode = READ.includes(name) ? 'read' : 'write'
  const res = await handleThrive(rpc('tools/call', { name, arguments: args }), env, mode)
  const json = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } }
  return { ...json.result, text: json.result.content[0].text }
}

async function listed(mode: 'read' | 'write') {
  const res = await handleThrive(rpc('tools/list'), env, mode)
  return ((await res.json()) as { result: { tools: { name: string; annotations?: Record<string, boolean> }[] } }).result.tools
}

const writes = (requests: Req[]) => requests.filter((r) => !r.action.startsWith('get'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  library = [workout()]
  history = [ftp()]
  oldApi = false
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

describe('the seven Spin tools on their endpoints', () => {
  it('puts the three reads on the read endpoint, readOnlyHint, and the four writes on the write endpoint', async () => {
    const read = await listed('read')
    const write = await listed('write')
    for (const name of READ) expect(read.find((t) => t.name === name)?.annotations).toEqual({ readOnlyHint: true })
    expect(write.map((t) => t.name).filter((n) => /ride_workout|ftp/.test(n)).sort()).toEqual([
      'thrive_add_ftp', 'thrive_create_ride_workout', 'thrive_delete_ride_workout', 'thrive_update_ride_workout',
    ])
    expect(read.map((t) => t.name).filter((n) => /create_ride|update_ride|delete_ride|add_ftp/.test(n))).toEqual([])
    const hint = (n: string) => write.find((t) => t.name === n)?.annotations
    expect(hint('thrive_update_ride_workout')).toEqual({ destructiveHint: true })
    expect(hint('thrive_delete_ride_workout')).toEqual({ destructiveHint: true })
    expect(hint('thrive_create_ride_workout')).toBeUndefined()
    expect(hint('thrive_add_ftp')).toBeUndefined()
  })
})

describe('thrive_list_ride_workouts', () => {
  it('lists id, name, category, duration and last ridden date, ordered by name, and filters', async () => {
    library = [
      workout({ id: 'rw_z', name: 'zone 2', category: 'Endurance', duration_s: '5400', last_ridden_date: '', description: 'easy' }),
      workout(),
    ]
    fakeApi()
    const all = await call('thrive_list_ride_workouts')
    expect(all.text).toBe([
      '2 ride workouts:',
      'rw_1a2b3c4d · Sweet Spot 3x12 · Sweet spot · 1:14 · last ridden 2026-11-01',
      'rw_z · zone 2 · Endurance · 1:30 · never ridden',
    ].join('\n'))
    expect((await call('thrive_list_ride_workouts', { category: 'Endurance' })).text).toContain('rw_z')
    expect((await call('thrive_list_ride_workouts', { category: 'Endurance' })).text).not.toContain('rw_1a2b3c4d')
    expect((await call('thrive_list_ride_workouts', { search: 'THREE' })).text).toContain('rw_1a2b3c4d')
    expect((await call('thrive_list_ride_workouts', { search: 'nope' })).text).toBe('No ride workouts match search "nope". The library has 2.')
    expect((await call('thrive_list_ride_workouts', { category: 'Tempo' })).isError).toBe(true)
  })

  it('says an empty library is empty', async () => {
    library = []
    fakeApi()
    expect((await call('thrive_list_ride_workouts')).text).toBe("No ride workouts in Thrive Spin's library.")
  })
})

describe('thrive_get_ride_workout', () => {
  it("prints #765's example in words with the repeat as 3 x [...], the total, and steps JSON that is unchanged when sent back", async () => {
    const requests = fakeApi()
    const r = await call('thrive_get_ride_workout', { id: 'rw_1a2b3c4d' })
    expect(r.isError).toBeUndefined()
    expect(r.text).toContain('3 x [')
    expect(r.text).toContain('1. Warm-up 10:00 ERG 50 -> 70% FTP')
    expect(r.text).toContain('   - Sweet spot 12:00 ERG 90% FTP, 90 rpm')
    expect(r.text).toContain('Total: 1:14:00')
    const json = JSON.parse(r.text.split('\n').at(-1)!)
    const back = await call('thrive_update_ride_workout', { id: 'rw_1a2b3c4d', steps: json, confirm: true })
    expect(back.isError).toBeUndefined()
    expect(back.text).toBe('Nothing to change: Sweet Spot 3x12 (rw_1a2b3c4d) already has these values. Nothing was written.')
    expect(writes(requests)).toEqual([])
  })

  it('refuses an unknown id, naming it', async () => {
    fakeApi()
    const r = await call('thrive_get_ride_workout', { id: 'rw_nope' })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('No ride workout with id "rw_nope"')
  })
})

describe('thrive_create_ride_workout', () => {
  it('sends one saveRideWorkout without an id, reports its id and total 1:15:00, and carries the reminder and call_id', async () => {
    const requests = fakeApi()
    const r = await call('thrive_create_ride_workout', {
      name: 'Sweet spot 75', category: 'Sweet spot', description: 'Two blocks.', steps: SWEET_SPOT_75,
    })
    expect(r.isError).toBeUndefined()
    const sent = writes(requests)
    expect(sent.map((q) => q.action)).toEqual(['saveRideWorkout'])
    const { call_id: callId, ...payload } = sent[0].payload
    expect(callId).toMatch(/^[0-9a-f-]{36}$/)
    expect(payload).toEqual({
      name: 'Sweet spot 75', category: 'Sweet spot', description: 'Two blocks.', steps: { v: 1, steps: SWEET_SPOT_75 },
    })
    expect('id' in payload).toBe(false)
    expect(JSON.stringify(payload)).not.toMatch(/duration_s"?:\s*"?\d{4,}|created|updated/)
    expect(r.text.startsWith('Created ride workout "Sweet spot 75" (rw_new00001): Sweet spot, 1:15:00, 4 blocks.')).toBe(true)
    expect(r.text.endsWith(`\n\n${REMINDER}`)).toBe(true)
    expect(library).toHaveLength(2)
  })

  it('takes the object form too, and a category in any case', async () => {
    const requests = fakeApi()
    const r = await call('thrive_create_ride_workout', {
      name: 'x', category: 'vo2', steps: { v: 1, steps: [{ label: 'Go', dur_s: 60, mode: 'free' }] },
    })
    expect(r.isError).toBeUndefined()
    expect(writes(requests)[0].payload.category).toBe('VO2')
  })

  const step = (o: object) => ({ label: 'S', dur_s: 60, mode: 'free', ...o })
  const refusals: [string, Record<string, unknown>, RegExp][] = [
    ['a nested repeat', { steps: [{ repeat: 2, steps: [{ repeat: 2, steps: [step({})] }] }] }, /^Error: block 1, step 1: a repeat cannot sit inside another repeat/],
    ['an unknown key', { steps: [step({ speed: 5 })] }, /^Error: block 1: unknown key "speed"/],
    ['pct 301', { steps: [step({}), { repeat: 2, steps: [step({ mode: 'erg', pct: 301 })] }] }, /^Error: block 2, step 1: pct 301 is over 300\./],
    ['grade 4.55', { steps: [step({ mode: 'slope', grade: 4.55 })] }, /^Error: block 1: grade must have at most one decimal/],
    ['a slope step carrying pct', { steps: [step({ mode: 'slope', grade: 4, pct: 90 })] }, /^Error: block 1: pct is not a target in slope mode/],
    ['an unknown category', { category: 'Tempo', steps: [step({})] }, /^Error: category "Tempo" is not one of/],
    ['a repeat of 1', { steps: [{ repeat: 1, steps: [step({})] }] }, /^Error: block 1: repeat 1 is under 2\./],
    ['a repeat of 51', { steps: [{ repeat: 51, steps: [step({ dur_s: 1 })] }] }, /^Error: block 1: repeat 51 is over 50\./],
    ['a 41-character label', { steps: [step({ label: 'x'.repeat(41) })] }, /^Error: block 1: label is 41 characters, over 40\./],
    ['a total over 21600 s', { steps: [{ repeat: 50, steps: [step({ dur_s: 432 })] }, step({ dur_s: 1 })] }, /^Error: steps: the workout adds up to 6:00:01 \(21601 seconds\)/],
    ['a blank name', { name: '  ', steps: [step({})] }, /^Error: name must be 1 to 80/],
    ['an unknown field', { steps: [step({})], duration_s: 60 }, /^Unknown field "duration_s" — nothing was written\./],
  ]
  for (const [name, args, message] of refusals) {
    it(`refuses ${name} before any request is sent`, async () => {
      const requests = fakeApi()
      const r = await call('thrive_create_ride_workout', { name: 'W', category: 'Endurance', ...args })
      expect(r.isError).toBe(true)
      expect(r.text).toMatch(message)
      expect(requests).toEqual([])
      expect(budget.stored.thrive).toBeUndefined()
    })
  }

  it('refuses a workout too long for the URL, naming the limit, and sends nothing', async () => {
    const requests = fakeApi()
    const steps = Array.from({ length: 45 }, (_, i) => step({ label: `Interval number ${i}`, dur_s: 60, mode: 'erg', pct: 100, cadence: 90 }))
    const r = await call('thrive_create_ride_workout', { name: 'W', category: 'Endurance', steps })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/too long to send/)
    expect(requests).toEqual([])
  })
})

describe('thrive_update_ride_workout', () => {
  const shorter = [{ label: 'Spin', dur_s: 300, mode: 'free' }]

  it('without confirm sends no write and shows only the fields that change, steps in words', async () => {
    const requests = fakeApi()
    const r = await call('thrive_update_ride_workout', { id: 'rw_1a2b3c4d', name: 'Short', steps: shorter })
    expect(r.isError).toBeUndefined()
    expect(writes(requests)).toEqual([])
    expect(r.text).toContain('DRY RUN — nothing written.')
    expect(r.text).toContain('- name: "Sweet Spot 3x12" -> "Short"')
    expect(r.text).not.toContain('- category')
    expect(r.text).toContain('Now (1:14:00):')
    expect(r.text).toContain('Would be (0:05:00):')
    expect(r.text).not.toContain(REMINDER)
    expect(budget.stored.thrive).toBeUndefined()
  })

  it('with confirm sends one saveRideWorkout with the id and the unchanged fields as read', async () => {
    const requests = fakeApi()
    const r = await call('thrive_update_ride_workout', { id: 'rw_1a2b3c4d', name: 'Short', steps: shorter, confirm: true })
    expect(r.isError).toBeUndefined()
    const sent = writes(requests)
    expect(sent.map((q) => q.action)).toEqual(['saveRideWorkout'])
    const { call_id: callId, ...payload } = sent[0].payload
    expect(callId).toMatch(/^[0-9a-f-]{36}$/)
    expect(payload).toEqual({
      id: 'rw_1a2b3c4d', name: 'Short', category: 'Sweet spot', description: 'Three blocks.', steps: { v: 1, steps: shorter },
    })
    expect(r.text.startsWith('Updated ride workout Short (rw_1a2b3c4d): name, steps. Now 0:05:00.')).toBe(true)
    expect(r.text.endsWith(`\n\n${REMINDER}`)).toBe(true)
  })

  it('called with only name, sends exactly the stored steps', async () => {
    const requests = fakeApi()
    await call('thrive_update_ride_workout', { id: 'rw_1a2b3c4d', name: 'Renamed', confirm: true })
    expect(writes(requests)[0].payload.steps).toEqual(EXAMPLE)
    expect(JSON.stringify(writes(requests)[0].payload.steps)).toBe(JSON.stringify(EXAMPLE))
  })

  it('says there is nothing to change when nothing differs, and when nothing is given', async () => {
    const requests = fakeApi()
    const same = await call('thrive_update_ride_workout', { id: 'rw_1a2b3c4d', name: 'Sweet Spot 3x12', confirm: true })
    expect(same.text).toContain('Nothing to change')
    const none = await call('thrive_update_ride_workout', { id: 'rw_1a2b3c4d' })
    expect(none.isError).toBe(true)
    expect(none.text).toContain('there is nothing to change. Nothing was written.')
    expect(writes(requests)).toEqual([])
  })

  it('refuses an unknown id rather than adding a row, naming it', async () => {
    const requests = fakeApi()
    const r = await call('thrive_update_ride_workout', { id: 'rw_nope', name: 'x', confirm: true })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('No ride workout with id "rw_nope"')
    expect(writes(requests)).toEqual([])
  })

  it('refuses bad steps before reading anything', async () => {
    const requests = fakeApi()
    const r = await call('thrive_update_ride_workout', { id: 'rw_1a2b3c4d', steps: [{ label: 'x', dur_s: 60, mode: 'erg', pct: 301 }] })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('block 1: pct 301 is over 300.')
    expect(requests).toEqual([])
  })
})

describe('thrive_delete_ride_workout', () => {
  it('without confirm deletes nothing and shows the workout and its last ridden date', async () => {
    const requests = fakeApi()
    const r = await call('thrive_delete_ride_workout', { id: 'rw_1a2b3c4d' })
    expect(r.isError).toBeUndefined()
    expect(writes(requests)).toEqual([])
    expect(r.text).toContain('rw_1a2b3c4d · Sweet Spot 3x12 · Sweet spot · 1:14 · last ridden 2026-11-01')
    expect(r.text).toContain('keep its id')
    expect(library).toHaveLength(1)
  })

  it('with confirm deletes and says thrive_undo can restore it', async () => {
    const requests = fakeApi()
    const r = await call('thrive_delete_ride_workout', { id: 'rw_1a2b3c4d', confirm: true })
    expect(writes(requests).map((q) => [q.action, q.payload.id])).toEqual([['deleteRideWorkout', 'rw_1a2b3c4d']])
    expect(r.text).toContain('Deleted ride workout Sweet Spot 3x12 (rw_1a2b3c4d). thrive_undo can restore it.')
    expect(library).toEqual([])
  })

  it('reports deleted: false as already gone, not as an error', async () => {
    fakeApi()
    const gone = vi.mocked(fetch)
    const real = gone.getMockImplementation()!
    gone.mockImplementation(async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url)
      if (url.searchParams.get('action') === 'deleteRideWorkout') {
        return new Response(JSON.stringify({ success: true, data: { id: 'rw_1a2b3c4d', deleted: false } }))
      }
      return real(input, init)
    })
    const r = await call('thrive_delete_ride_workout', { id: 'rw_1a2b3c4d', confirm: true })
    expect(r.isError).toBeUndefined()
    expect(r.text).toContain('was already gone')
    expect(r.text).toContain('Nothing was deleted.')
  })

  it('refuses an unknown id, naming it', async () => {
    fakeApi()
    const r = await call('thrive_delete_ride_workout', { id: 'rw_nope', confirm: true })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('No ride workout with id "rw_nope"')
  })
})

describe('thrive_ftp', () => {
  it('prints the current FTP with its date and source, then the history newest first; a ramp test names its ride', async () => {
    history = [
      ftp({ id: 'f3', date: '2026-10-20', ftp_w: '255', source: 'manual', ride_id: '' }),
      ftp(),
      ftp({ id: 'f1', date: '2025-06-01', ftp_w: '230', source: 'manual', ride_id: '' }),
    ]
    fakeApi()
    const r = await call('thrive_ftp')
    expect(r.text).toBe([
      'Current FTP: 255 W, set 2026-10-20 (manual)',
      '',
      'History, newest first (3 of 3):',
      '- 2026-10-20 · 255 W · manual',
      '- 2026-03-02 · 240 W · ramp test (ride ride-9)',
      '- 2025-06-01 · 230 W · manual',
    ].join('\n'))
    const narrowed = await call('thrive_ftp', { from: '2026-01-01', to: '2026-06-30' })
    expect(narrowed.text).toContain('Current FTP: 255 W')
    expect(narrowed.text).toContain('- 2026-03-02 · 240 W')
    expect(narrowed.text).not.toContain('2025-06-01')
    expect((await call('thrive_ftp', { from: '2026-06-30', to: '2026-01-01' })).isError).toBe(true)
  })

  it('says no FTP is recorded on an empty history', async () => {
    history = []
    fakeApi()
    expect((await call('thrive_ftp')).text).toBe('No FTP is recorded.')
  })
})

describe('thrive_add_ftp', () => {
  it('without confirm writes nothing and shows the current FTP beside the new one', async () => {
    const requests = fakeApi()
    const r = await call('thrive_add_ftp', { ftp_w: 250 })
    expect(r.isError).toBeUndefined()
    expect(writes(requests)).toEqual([])
    expect(r.text).toContain('FTP now: 240 W (set 2026-03-02, ramp test (ride ride-9)).')
    expect(r.text).toContain('New: 250 W on 2026-11-03, source manual.')
    expect(budget.stored.thrive).toBeUndefined()
  })

  it('with confirm sends one addFtp: source manual, a minted id, the date, no ride_id', async () => {
    const requests = fakeApi()
    const r = await call('thrive_add_ftp', { ftp_w: 250, date: 'yesterday', confirm: true })
    expect(r.isError).toBeUndefined()
    const sent = writes(requests)
    expect(sent.map((q) => q.action)).toEqual(['addFtp'])
    const { id, call_id: callId, ...rest } = sent[0].payload
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(callId).toMatch(/^[0-9a-f-]{36}$/)
    expect(rest).toEqual({ date: '2026-11-02', ftp_w: 250, source: 'manual' })
    expect(r.text).toContain('Set FTP to 250 W on 2026-11-02 (manual).')
    expect(r.text).toContain('not rescored')
    expect(r.text.endsWith(`\n\n${REMINDER}`)).toBe(true)
  })

  const refusals: [string, Record<string, unknown>, RegExp][] = [
    ['an FTP of 49', { ftp_w: 49 }, /^Error: ftp_w must be a whole number of watts, 50 to 1000/],
    ['an FTP of 1001', { ftp_w: 1001 }, /^Error: ftp_w must be a whole number of watts/],
    ['a fractional FTP', { ftp_w: 250.5 }, /^Error: ftp_w must be a whole number of watts/],
    ['a future date', { ftp_w: 250, date: '2026-11-04' }, /^Error: date 2026-11-04 is after today \(2026-11-03\)/],
    ['a date that is not real', { ftp_w: 250, date: '2026-02-30' }, /^Error: date "2026-02-30" is not a real date/],
    ['the current FTP again', { ftp_w: 240 }, /^Error: 240 W is already the current FTP \(set 2026-03-02\)/],
    ['a source', { ftp_w: 250, source: 'ramp_test' }, /^Unknown field "source" — nothing was written\./],
    ['a ride_id', { ftp_w: 250, ride_id: 'ride-1' }, /^Unknown field "ride_id" — nothing was written\./],
  ]
  for (const [name, args, message] of refusals) {
    it(`refuses ${name}, writing nothing`, async () => {
      const requests = fakeApi()
      const r = await call('thrive_add_ftp', { ...args, confirm: true })
      expect(r.isError).toBe(true)
      expect(r.text).toMatch(message)
      expect(writes(requests)).toEqual([])
      expect(budget.stored.thrive).toBeUndefined()
    })
  }

  it('adds the first FTP when there is none', async () => {
    history = []
    fakeApi()
    const dry = await call('thrive_add_ftp', { ftp_w: 250 })
    expect(dry.text).toContain('FTP now: none recorded.')
    expect((await call('thrive_add_ftp', { ftp_w: 250, confirm: true })).isError).toBeUndefined()
    expect(history).toHaveLength(1)
  })
})

describe('an API from before #765', () => {
  it('answers the actions as unknown: a tool error that names the update, and nothing written', async () => {
    oldApi = true
    const requests = fakeApi()
    const calls: [string, Record<string, unknown>][] = [
      ['thrive_list_ride_workouts', {}],
      ['thrive_get_ride_workout', { id: 'rw_1' }],
      ['thrive_ftp', {}],
      ['thrive_update_ride_workout', { id: 'rw_1', name: 'x', confirm: true }],
      ['thrive_delete_ride_workout', { id: 'rw_1', confirm: true }],
      ['thrive_add_ftp', { ftp_w: 250, confirm: true }],
      ['thrive_create_ride_workout', { name: 'x', category: 'Endurance', steps: [{ label: 'a', dur_s: 60, mode: 'free' }] }],
    ]
    for (const [name, args] of calls) {
      const r = await call(name, args)
      expect(r.isError, name).toBe(true)
      expect(r.text, name).toContain("Apps Script has not been updated to #765's version")
      expect(r.text, name).not.toContain(REMINDER)
    }
    expect(requests.filter((q) => q.action === 'saveRideWorkout' || q.action === 'addFtp' || q.action === 'deleteRideWorkout').length).toBeLessThanOrEqual(1)
  })
})

describe('write limits (#410)', () => {
  it('counts a confirmed write as one write of one row, and a dry run or a refusal as none', async () => {
    fakeApi()
    await call('thrive_update_ride_workout', { id: 'rw_1a2b3c4d', name: 'Short' })
    await call('thrive_delete_ride_workout', { id: 'rw_1a2b3c4d' })
    await call('thrive_add_ftp', { ftp_w: 250 })
    await call('thrive_add_ftp', { ftp_w: 5 })
    expect(budget.stored.thrive).toBeUndefined()
    await call('thrive_create_ride_workout', { name: 'a', category: 'Endurance', steps: [{ label: 'a', dur_s: 60, mode: 'free' }] })
    await call('thrive_update_ride_workout', { id: 'rw_1a2b3c4d', name: 'Short', confirm: true })
    await call('thrive_add_ftp', { ftp_w: 250, confirm: true })
    await call('thrive_delete_ride_workout', { id: 'rw_1a2b3c4d', confirm: true })
    expect(budget.stored.thrive).toHaveLength(4)
    expect(budget.stored.thrive.every((e) => e.rows === 1)).toBe(true)
  })

  it('refuses all four write tools once the hourly ceiling is reached', async () => {
    env = { ...env, MAX_WRITES_PER_HOUR: '1' } as Env
    const requests = fakeApi()
    const ok = await call('thrive_add_ftp', { ftp_w: 250, confirm: true })
    expect(ok.isError).toBeUndefined()
    const before = writes(requests).length
    const attempts: [string, Record<string, unknown>][] = [
      ['thrive_create_ride_workout', { name: 'a', category: 'Endurance', steps: [{ label: 'a', dur_s: 60, mode: 'free' }] }],
      ['thrive_update_ride_workout', { id: 'rw_1a2b3c4d', name: 'Short', confirm: true }],
      ['thrive_delete_ride_workout', { id: 'rw_1a2b3c4d', confirm: true }],
      ['thrive_add_ftp', { ftp_w: 260, confirm: true }],
    ]
    for (const [name, args] of attempts) {
      const r = await call(name, args)
      expect(r.isError, name).toBe(true)
      expect(r.text.startsWith('Write limit reached for Thrive: 1 writes in the last hour.'), name).toBe(true)
    }
    expect(writes(requests)).toHaveLength(before)
  })
})
