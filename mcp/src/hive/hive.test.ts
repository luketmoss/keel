import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../env'
import stdioTools from '../../test/fixtures/hive-stdio-tools.json'
import { handleHive } from './index'

const KEY = 'secret-key-123'
const URL_ = 'https://script.google.com/macros/s/abc/exec'
const env = { HIVE_API_URL: URL_, HIVE_API_KEY: KEY, HIVE_DEFAULT_OWNER: 'Default Owner' } as Env

function rpc(method: string, params?: unknown): Request {
  return new Request('https://example.test/hive/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
}

async function call(name: string, args: Record<string, unknown> = {}, e: Env = env) {
  const res = await handleHive(rpc('tools/call', { name, arguments: args }), e)
  const json = (await res.json()) as {
    result: { content: { text: string }[]; isError?: boolean }
  }
  return json.result
}

/** Canonical form for comparing JSON schemas produced by different zod versions. */
function canon(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canon)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => k !== '$schema' && k !== 'additionalProperties')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canon(v)]),
    )
  }
  return value
}

function fakeHive(handler: (url: URL) => unknown) {
  const calls: URL[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      calls.push(url)
      const out = handler(url)
      if (out instanceof Response) return out
      return new Response(JSON.stringify(out), { status: 200 })
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('hive tool list', () => {
  it('matches the stdio server tool for tool: names, descriptions and input schemas', async () => {
    const res = await handleHive(rpc('tools/list'), env)
    const json = (await res.json()) as {
      result: { tools: { name: string; description: string; inputSchema: unknown }[] }
    }
    const worker = json.result.tools
      .map(({ name, description, inputSchema }) => ({ name, description, inputSchema: canon(inputSchema) }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const stdio = stdioTools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema: canon(inputSchema),
    }))
    expect(worker.map((t) => t.name)).toEqual([
      'hive_add_item',
      'hive_create_label',
      'hive_get_item',
      'hive_list_boards',
      'hive_list_items',
      'hive_list_labels',
      'hive_list_owners',
      'hive_update_item',
    ])
    expect(worker).toEqual(stdio)
  })
})

describe('hive tools', () => {
  it('lists boards through the Apps Script API with the MCP key', async () => {
    const calls = fakeHive(() => ({ success: true, data: [{ id: 'b1', name: 'Work', color: 'blue' }] }))
    const result = await call('hive_list_boards')
    expect(result.content[0].text).toBe('- **Work** (id: b1, color: blue)')
    expect(calls[0].searchParams.get('action')).toBe('getBoards')
    expect(calls[0].searchParams.get('key')).toBe(KEY)
  })

  it('uses the default owner when hive_add_item gets none', async () => {
    const calls = fakeHive((url) => {
      const action = url.searchParams.get('action')
      if (action === 'getBoards') return { success: true, data: [{ id: 'b1', name: 'Work' }] }
      if (action === 'createItem') {
        const payload = JSON.parse(url.searchParams.get('payload')!)
        return { success: true, data: { id: 'i1', title: payload.data.title, status: 'To Do', owner: payload.data.owner } }
      }
      return { success: true, data: [] }
    })
    const result = await call('hive_add_item', { board: 'work', title: 'Write tests' })
    const create = calls.find((u) => u.searchParams.get('action') === 'createItem')!
    expect(JSON.parse(create.searchParams.get('payload')!).data.owner).toBe('Default Owner')
    expect(result.content[0].text).toContain('Owner: Default Owner')
  })

  it("surfaces Hive's invalid-key error as a tool error", async () => {
    fakeHive(() => ({ success: false, error: 'Invalid or missing API key' }))
    const result = await call('hive_list_boards')
    expect(result.content[0].text).toBe('Error: Invalid or missing API key')
  })

  it('turns an unreachable Hive into a tool error that omits the key and the URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(`connect failed for ${URL_}?key=${KEY}`)
      }),
    )
    const result = await call('hive_list_boards')
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Could not reach Hive')
    expect(result.content[0].text).not.toContain(KEY)
    expect(result.content[0].text).not.toContain(URL_)
  })

  it('turns a non-JSON response into a tool error', async () => {
    fakeHive(() => new Response('<html>Sign in</html>', { status: 200 }))
    const result = await call('hive_list_boards')
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('not JSON')
  })

  it('turns an HTTP failure into a tool error that omits the key', async () => {
    fakeHive(() => new Response(`oops ${KEY}`, { status: 500 }))
    const result = await call('hive_list_boards')
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('HTTP 500')
    expect(result.content[0].text).not.toContain(KEY)
  })

  it('refuses with 503 when Hive is not configured', async () => {
    const res = await handleHive(rpc('tools/list'), {} as Env)
    expect(res.status).toBe(503)
  })
})
