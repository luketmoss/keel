import { describe, expect, it } from 'vitest'
import worker from './index'
import { FORAGE_RESOURCE, FORAGE_WRITE_RESOURCE, HIVE_WRITE_RESOURCE, THRIVE_WRITE_RESOURCE, PUBLIC_URL } from './config'
import type { Env } from './env'

// #409: the endpoints are separate OAuth resources (six since #713's Forage). Whether a token for one is
// refused at the others on the deployed Worker is checked by hand with curl; this
// is the routing and the metadata, which need no KV.
const env = {} as Env
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext

describe('the write resources (#409)', () => {
  it.each([
    ['thrive', '/thrive/write/mcp', THRIVE_WRITE_RESOURCE],
    ['hive', '/hive/write/mcp', HIVE_WRITE_RESOURCE],
    ['thrive read', '/thrive/mcp', `${PUBLIC_URL}/thrive/mcp`],
    ['hive read', '/hive/mcp', `${PUBLIC_URL}/hive/mcp`],
    ['forage read', '/forage/mcp', FORAGE_RESOURCE],
    ['forage write', '/forage/write/mcp', FORAGE_WRITE_RESOURCE],
  ])('serves protected-resource metadata for %s', async (_name, path, resource) => {
    const res = await worker.fetch(
      new Request(`${PUBLIC_URL}/.well-known/oauth-protected-resource${path}`),
      env,
      ctx,
    )
    expect(res.status).toBe(200)
    expect(((await res.json()) as { resource: string }).resource).toBe(resource)
  })

  it('refuses an unauthenticated call to each endpoint with a 401', async () => {
    for (const path of ['/thrive/mcp', '/thrive/write/mcp', '/hive/mcp', '/hive/write/mcp', '/forage/mcp', '/forage/write/mcp']) {
      const res = await worker.fetch(new Request(`${PUBLIC_URL}${path}`, { method: 'POST' }), env, ctx)
      expect(res.status, path).toBe(401)
    }
  })

})
