import { describe, expect, it } from 'vitest'
import { handleHello } from './hello'

const props = { login: 'octocat', id: 583231 }

function rpc(body: unknown): Request {
  return new Request('https://example.test/hello/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  })
}

describe('hello MCP endpoint', () => {
  it('lists exactly the whoami tool', async () => {
    const res = await handleHello(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), props)
    const json = (await res.json()) as { result: { tools: { name: string }[] } }
    expect(json.result.tools.map((t) => t.name)).toEqual(['whoami'])
  })

  it('whoami returns the signed-in login and numeric ID', async () => {
    const res = await handleHello(
      rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'whoami', arguments: {} } }),
      props,
    )
    const json = (await res.json()) as { result: { content: { text: string }[] } }
    expect(JSON.parse(json.result.content[0].text)).toEqual(props)
  })
})
