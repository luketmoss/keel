import { PUBLIC_URL } from './config'

export const CALLBACK_URL = `${PUBLIC_URL}/callback`

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function newVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(48)))
}

export async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

export function githubAuthorizeUrl(clientId: string, state: string, codeChallenge: string): string {
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', CALLBACK_URL)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export interface GithubUser {
  id: number
  login: string
}

/** Trade the callback's code for the signed-in user. The access token is used once and dropped. */
export async function exchangeForUser(
  code: string,
  verifier: string,
  clientId: string,
  clientSecret: string,
): Promise<GithubUser> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: CALLBACK_URL,
      code_verifier: verifier,
    }),
  })
  const token = (await tokenRes.json()) as { access_token?: string }
  if (!tokenRes.ok || !token.access_token) throw new Error('GitHub did not issue a token')

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'keel-mcp',
    },
  })
  const user = (await userRes.json()) as { id?: unknown; login?: unknown }
  if (!userRes.ok || typeof user.id !== 'number' || typeof user.login !== 'string') {
    throw new Error('GitHub did not return a user')
  }
  return { id: user.id, login: user.login }
}
