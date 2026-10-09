import { afterEach, describe, expect, it, vi } from 'vitest'
import stdioTools from '../../test/fixtures/thrive-stdio-tools.json'
import type { Env } from '../env'
import { handleThrive } from './index'

const KEY = 'thrive-secret-key-123'
const URL_ = 'https://script.google.com/macros/s/thrive/exec'
const env = { THRIVE_API_URL: URL_, THRIVE_API_KEY: KEY } as Env

const DESTRUCTIVE = ['thrive_delete_exercise', 'thrive_delete_workout', 'thrive_set_journal_entry']
const READ_ONLY = [
  'thrive_body_measurements',
  'thrive_daily_health',
  'thrive_daily_summary',
  'thrive_exercise_history',
  'thrive_get_workout',
  'thrive_get_workout_payload',
  'thrive_journal',
  'thrive_list_exercises',
  'thrive_list_templates',
  'thrive_list_workouts',
]

function rpc(method: string, params?: unknown): Request {
  return new Request('https://example.test/thrive/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await handleThrive(rpc('tools/call', { name, arguments: args }), env)
  const json = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } }
  return json.result
}

type Listed = { name: string; description: string; inputSchema: unknown; annotations?: Record<string, boolean> }

async function listTools(): Promise<Listed[]> {
  const res = await handleThrive(rpc('tools/list'), env)
  return ((await res.json()) as { result: { tools: Listed[] } }).result.tools
}

const SAFE_INT = Number.MAX_SAFE_INTEGER

/**
 * Canonical form for comparing JSON schemas produced by different zod versions.
 * Zod 4 bounds every `.int()` at the safe-integer range and zod 3 does not; the
 * bound never rejects a value anyone sends, so it is not a difference worth
 * failing on.
 */
function canon(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canon)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => k !== '$schema' && k !== 'additionalProperties')
        .filter(([k, v]) => !((k === 'maximum' && v === SAFE_INT) || (k === 'minimum' && v === -SAFE_INT)))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canon(v)]),
    )
  }
  return value
}

/** A fake Thrive API: answers by action, records every request. */
function fakeThrive(answer: (action: string, url: URL) => unknown) {
  const urls: URL[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      urls.push(url)
      const out = answer(url.searchParams.get('action') ?? '', url)
      if (out instanceof Response) return out
      return new Response(JSON.stringify(out), { status: 200 })
    }),
  )
  return urls
}

afterEach(() => vi.unstubAllGlobals())

describe('thrive tool list', () => {
  it('matches the stdio server tool for tool: names, descriptions and input schemas', async () => {
    const worker = (await listTools())
      .map(({ name, description, inputSchema }) => ({ name, description, inputSchema: canon(inputSchema) }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const stdio = stdioTools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema: canon(inputSchema),
    }))
    expect(worker).toHaveLength(22)
    expect(worker).toEqual(stdio)
  })

  it('marks the three destructive tools and every read tool', async () => {
    const tools = await listTools()
    const hint = (name: string) => tools.find((t) => t.name === name)?.annotations
    for (const name of DESTRUCTIVE) expect(hint(name)?.destructiveHint, name).toBe(true)
    for (const name of READ_ONLY) expect(hint(name)?.readOnlyHint, name).toBe(true)
    // No other tool claims either hint.
    for (const t of tools) {
      if (DESTRUCTIVE.includes(t.name) || READ_ONLY.includes(t.name)) continue
      expect(t.annotations?.destructiveHint, t.name).toBeUndefined()
      expect(t.annotations?.readOnlyHint, t.name).toBeUndefined()
    }
  })
})

describe('thrive tools through the Worker', () => {
  it('reads through the Apps Script API with the MCP key', async () => {
    const urls = fakeThrive(() => ({ success: true, data: [] }))
    const result = await call('thrive_list_workouts')
    expect(result.isError).toBeUndefined()
    expect(urls[0].searchParams.get('action')).toBe('getWorkouts')
    expect(urls[0].searchParams.get('key')).toBe(KEY)
  })

  it("surfaces Thrive's invalid-key error as a tool error", async () => {
    fakeThrive(() => ({ success: false, error: 'Invalid or missing API key' }))
    const result = await call('thrive_list_workouts')
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Invalid or missing API key')
  })

  it('sends a write once, and says on a non-JSON reply that it may not have landed', async () => {
    const urls = fakeThrive((action) => {
      if (action === 'getWorkout') return { success: true, data: { id: 'w1', name: 'Upper', type: 'weight' } }
      if (action === 'getSets') return { success: true, data: [] }
      return new Response('<html>Sign in</html>', { status: 200 })
    })
    const result = await call('thrive_update_workout', { workout_id: 'w1', notes: 'felt good' })
    const writes = urls.filter((u) => u.searchParams.get('action') === 'updateWorkout')
    expect(writes).toHaveLength(1)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('may or may not have been applied')
  })

  it('keeps the key and URL out of an unreachable-API error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(`connect failed for ${URL_}?key=${KEY}`)
      }),
    )
    const result = await call('thrive_list_exercises')
    expect(result.isError).toBe(true)
    expect(result.content[0].text).not.toContain(KEY)
    expect(result.content[0].text).not.toContain(URL_)
  })

  it('previews a workout delete without confirm and writes nothing', async () => {
    const urls = fakeThrive((action) => {
      if (action === 'getWorkout') return { success: true, data: { id: 'w1', name: 'Upper', type: 'weight', date: '2026-09-22' } }
      return { success: true, data: [] }
    })
    const result = await call('thrive_delete_workout', { workout_id: 'w1' })
    expect(result.content[0].text).toMatch(/DRY RUN/)
    expect(urls.some((u) => u.searchParams.get('action') === 'deleteWorkout')).toBe(false)
  })

  it('previews clearing a journal note without confirm and writes nothing', async () => {
    const urls = fakeThrive((action) => {
      if (action === 'getJournal') return { success: true, data: [{ date: '2026-09-22', note: 'Legs heavy.' }] }
      return { success: true, data: [] }
    })
    const result = await call('thrive_set_journal_entry', { date: '2026-09-22', note: '' })
    expect(result.content[0].text).toMatch(/confirm: true/)
    expect(urls.some((u) => u.searchParams.get('action') === 'upsertJournal')).toBe(false)
  })

  it('previews an exercise delete without confirm and writes nothing', async () => {
    const urls = fakeThrive((action) => {
      if (action === 'getExercises') return { success: true, data: [{ id: 'e1', name: 'Squat', tags: '' }] }
      return { success: true, data: [] }
    })
    const result = await call('thrive_delete_exercise', { exercise: 'Squat' })
    expect(result.content[0].text).toMatch(/DRY RUN/)
    expect(urls.some((u) => u.searchParams.get('action') === 'deleteExercise')).toBe(false)
  })

  it('refuses with 503 when Thrive is not configured', async () => {
    const res = await handleThrive(rpc('tools/list'), {} as Env)
    expect(res.status).toBe(503)
  })
})

describe('home time on a UTC Worker', () => {
  // 02:30 UTC on 10 Oct is 20:30 on 9 Oct in Denver (MDT). The stdio server ran
  // on the athlete's own clock; a Worker's clock is UTC, so without home-time
  // handling every evening's "today" would be tomorrow.
  afterEach(() => vi.useRealTimers())

  it('resolves today, tomorrow and +Nd against the Denver date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T02:30:00Z'))
    const { normalizeDate, todayStr, nowTimeStr } = await import('./domain.js')
    expect(todayStr()).toBe('2026-10-09')
    expect(normalizeDate('today')).toBe('2026-10-09')
    expect(normalizeDate('tomorrow')).toBe('2026-10-10')
    expect(normalizeDate('+3d')).toBe('2026-10-12')
    expect(nowTimeStr()).toBe('20:30')
  })

  it('keeps counting days correctly across the November DST change', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T05:30:00Z')) // 23:30 on 31 Oct in Denver
    const { normalizeDate } = await import('./domain.js')
    expect(normalizeDate('today')).toBe('2026-10-31')
    expect(normalizeDate('+2d')).toBe('2026-11-02')
  })
})
