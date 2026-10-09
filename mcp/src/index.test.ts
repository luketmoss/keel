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

describe('consent page', () => {
  it('is served as HTML, not plain text', async () => {
    const env = {
      OAUTH_PROVIDER: {
        parseAuthRequest: async () => ({}),
        describeConsent: async () => ({
          clientName: 'Claude',
          clientDomain: 'claude.ai',
          redirectHost: 'claude.ai',
          redirectIsLoopback: false,
        }),
        beginConsent: async () => ({
          handle: 'h',
          headers: new Headers({ 'Set-Cookie': 'a=b', 'X-Frame-Options': 'DENY' }),
        }),
      },
    } as unknown as Env
    const res = await handleAuth(new Request('https://example.test/authorize'), env)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(await res.text()).toContain('<h1>Allow Claude?</h1>')
  })
})
