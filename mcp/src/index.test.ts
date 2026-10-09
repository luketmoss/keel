import { describe, expect, it } from 'vitest'
import { handleAuth } from './auth'
import type { Env } from './env'

const env = {} as Env

describe('handleAuth', () => {
  it('answers /health', async () => {
    const res = await handleAuth(new Request('https://example.test/health'), env)
    expect(res.status).toBe(200)
  })

  it('404s everything else', async () => {
    const res = await handleAuth(new Request('https://example.test/nope'), env)
    expect(res.status).toBe(404)
  })
})
