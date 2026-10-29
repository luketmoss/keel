import { describe, expect, it } from 'vitest'
import { handleAuth } from './auth'
import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import type { Env } from './env'

const env = {} as Env
const noOauth = {} as OAuthHelpers

describe('handleAuth', () => {
  it('answers /health', async () => {
    const res = await handleAuth(new Request('https://example.test/health'), env, noOauth)
    expect(res.status).toBe(200)
  })

  it('404s everything else', async () => {
    const res = await handleAuth(new Request('https://example.test/nope'), env, noOauth)
    expect(res.status).toBe(404)
  })
})

describe('consent page', () => {
  it('is served as HTML, not plain text', async () => {
    const oauth = {
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
    } as unknown as OAuthHelpers
    const res = await handleAuth(new Request('https://example.test/authorize'), env, oauth)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(await res.text()).toContain('<h1>Allow Claude?</h1>')
  })
})

describe('callback', () => {
  it('keeps the grants other Claude accounts already hold', async () => {
    let options: Record<string, unknown> | undefined
    const oauth = {
      finishUpstream: async () => ({
        request: { scope: [] },
        data: { verifier: 'v' },
        headers: new Headers(),
      }),
      completeAuthorization: async (o: Record<string, unknown>) => {
        options = o
        return { redirectTo: 'https://claude.ai/api/mcp/auth_callback?code=c' }
      },
    } as unknown as OAuthHelpers
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) =>
      String(input).includes('access_token')
        ? Response.json({ access_token: 't' })
        : Response.json({ id: 42, login: 'owner' })) as typeof fetch
    try {
      const res = await handleAuth(
        new Request('https://example.test/callback?code=c&state=s'),
        { ...env, ALLOWED_GITHUB_ID: '42' } as Env,
        oauth,
      )
      expect(res.status).toBe(302)
    } finally {
      globalThis.fetch = realFetch
    }
    expect(options?.userId).toBe('42')
    expect(options?.revokeExistingGrants).toBe(false)
  })
})
