import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import { fakeBudget } from '../../test/fake-budget'
import { handleThrive } from './index'

// #691: thrive_trail_history end to end through the Worker, against a fake
// Apps Script API that records every request. The wording itself is pinned in
// trails.test.js; this file checks routing, requests and errors. Synthetic only.

const KEY = 'thrive-secret-key-123'
const URL_ = 'https://script.google.com/macros/s/thrive/exec'
const env = { THRIVE_API_URL: URL_, THRIVE_API_KEY: KEY, WRITE_BUDGET: fakeBudget().namespace } as Env

function rpc(method: string, params?: unknown): Request {
  return new Request('https://example.test/thrive/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
}

type Result = { content: { text: string }[]; isError?: boolean }

async function call(args: Record<string, unknown>, mode: 'read' | 'write' = 'read') {
  const res = await handleThrive(rpc('tools/call', { name: 'thrive_trail_history', arguments: args }), env, mode)
  const json = (await res.json()) as { result?: Result; error?: { message: string } }
  return json
}

const tagged = '{"v":1,"m":1,"u":0,"n":[["Heron Loop",1000]],"p":[[0,0,100,1,1000,300,40,0]]}'
const workout = (o: Record<string, string>) => ({
  id: 'w1', date: '2000-01-01', time: '08:00', type: 'bike', sub_type: 'mtb', name: 'Morning ride', status: '',
  track_ref: 'trk', trails: '', ...o,
})

/** A fake Thrive API: answers by action, records every action asked for. */
function fakeThrive(answer: (action: string) => unknown) {
  const actions: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const action = url.searchParams.get('action') ?? ''
      actions.push(action)
      const out = answer(action)
      if (out instanceof Response) return out
      return new Response(JSON.stringify(out), { status: 200 })
    }),
  )
  return actions
}

afterEach(() => vi.unstubAllGlobals())

describe('thrive_trail_history (#691)', () => {
  it('is served read-only on /thrive/mcp and not on /thrive/write/mcp', async () => {
    const list = async (mode: 'read' | 'write') => {
      const res = await handleThrive(rpc('tools/list'), env, mode)
      return ((await res.json()) as { result: { tools: { name: string; annotations?: unknown }[] } }).result.tools
    }
    expect((await list('read')).find((t) => t.name === 'thrive_trail_history')?.annotations).toEqual({ readOnlyHint: true })
    expect((await list('write')).some((t) => t.name === 'thrive_trail_history')).toBe(false)
  })

  it('makes exactly one request, getWorkouts, and answers from it', async () => {
    const actions = fakeThrive(() => ({ success: true, data: [workout({ trails: tagged })] }))
    const { result } = await call({ trail: 'heron loop' })
    expect(result!.isError).toBeUndefined()
    expect(result!.content[0].text).toMatch(/^\*\*Heron Loop\*\* — 1 visit, 1 pass, 2000-01-01\./)
    expect(actions).toEqual(['getWorkouts'])
  })

  it('refuses unknown fields by name, before any request', async () => {
    const actions = fakeThrive(() => ({ success: true, data: [] }))
    const { result } = await call({ trail: 'heron', direction: 'forward' })
    expect(result!.isError).toBe(true)
    expect(result!.content[0].text).toContain('Unknown field "direction"')
    expect(actions).toEqual([])
  })

  it.each([
    [{ trail: ' h ' }, 'trail must be at least 2 characters.'],
    [{ trail: 'heron', date_from: 'soon' }, 'date_from "soon" is not a date. Use YYYY-MM-DD, today, yesterday or an offset such as -30d.'],
    [{ trail: 'heron', date_to: 'later' }, 'date_to "later" is not a date. Use YYYY-MM-DD, today, yesterday or an offset such as -30d.'],
    [{ trail: 'heron', date_from: '2000-02-01', date_to: '2000-01-01' }, 'date_from is after date_to.'],
    [{ trail: 'heron', limit: 0 }, 'limit must be a whole number from 1 to 50.'],
    [{ trail: 'heron', limit: 51 }, 'limit must be a whole number from 1 to 50.'],
    [{ trail: 'heron', limit: 2.5 }, 'limit must be a whole number from 1 to 50.'],
  ])('refuses %j before any request', async (args, message) => {
    const actions = fakeThrive(() => ({ success: true, data: [] }))
    const { result } = await call(args)
    expect(result!.isError).toBe(true)
    expect(result!.content[0].text).toBe(message)
    expect(actions).toEqual([])
  })

  it('accepts limit at 1 and 50, and the relative date forms', async () => {
    fakeThrive(() => ({ success: true, data: [workout({ trails: tagged })] }))
    for (const args of [{ limit: 1 }, { limit: 50 }, { date_from: '-30d', date_to: 'today' }, { date_to: 'yesterday' }]) {
      const { result } = await call({ trail: 'heron loop', ...args })
      expect(result!.isError, JSON.stringify(args)).toBeUndefined()
    }
  })

  it('says the API has not been updated when no row carries trails, but not for an empty list', async () => {
    const { trails: _dropped, ...older } = workout({})
    fakeThrive(() => ({ success: true, data: [older, { ...older, id: 'w2' }] }))
    const before = await call({ trail: 'heron' })
    expect(before.result!.isError).toBe(true)
    expect(before.result!.content[0].text).toBe(
      'The Thrive API did not send trails with the workouts, so it has not been updated to the version that tags trails (#688). There is nothing to search yet.',
    )
    vi.unstubAllGlobals()
    fakeThrive(() => ({ success: true, data: [] }))
    const empty = await call({ trail: 'heron' })
    expect(empty.result!.isError).toBeUndefined()
    expect(empty.result!.content[0].text).toBe('No tagged activity has a trail matching "heron".')
  })

  it('passes a getWorkouts failure on as the existing Error text, with the key and URL scrubbed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(`connect failed for ${URL_}?key=${KEY}`)
      }),
    )
    const { result } = await call({ trail: 'heron' })
    expect(result!.isError).toBe(true)
    expect(result!.content[0].text).toMatch(/^Error: /)
    expect(result!.content[0].text).not.toContain(KEY)
    expect(result!.content[0].text).not.toContain(URL_)
  })

  it('passes an API refusal on as a tool error', async () => {
    fakeThrive(() => ({ success: false, error: 'Invalid or missing API key' }))
    const { result } = await call({ trail: 'heron' })
    expect(result!.isError).toBe(true)
    expect(result!.content[0].text).toBe('Error: Invalid or missing API key')
  })

  it('never prints the raw cell', async () => {
    const unreadable = '{"v":1,"m":1,"u":0,"n":[["Hidden Spur",9]],"p":[[4,0,100,1,9,9,9,9]]}'
    fakeThrive(() => ({ success: true, data: [workout({ trails: tagged }), workout({ id: 'w2', date: '2000-01-02', trails: unreadable })] }))
    const { result } = await call({ trail: 'heron loop' })
    const out = result!.content[0].text
    expect(out).not.toContain(tagged)
    expect(out).not.toContain(unreadable)
    expect(out).not.toContain('Hidden Spur')
    expect(out).toContain('Unreadable: 1 tracked activity has a trails value this tool cannot read and is left out.')
  })
})
