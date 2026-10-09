import { describe, expect, it } from 'vitest'
import { CALLBACK_URL, githubAuthorizeUrl, s256 } from './github'

describe('github', () => {
  it('computes the RFC 7636 S256 challenge', async () => {
    // Test vector from RFC 7636 appendix B.
    expect(await s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })

  it('builds an authorize URL with state, PKCE and the callback', () => {
    const url = new URL(githubAuthorizeUrl('client-1', 'state-1', 'challenge-1'))
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('client-1')
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('redirect_uri')).toBe(CALLBACK_URL)
  })
})
