import { describe, expect, it } from 'vitest'
import { fakeBudget } from '../test/fake-budget'
import worker from './index'
import { authorizationServer } from './oauth'
import { PUBLIC_URL } from './config'
import type { Env } from './env'

// #713 (as #409): each endpoint is its own OAuth resource, so a token issued for
// one is refused at every other. A real token, minted by the Worker's own
// authorization server over an in-memory KV and presented to all six endpoints.
// Signing in with GitHub is left out: completeAuthorization is what /callback
// calls once the owner's GitHub id has passed the gate (allow.test.ts).

const ENDPOINTS = ['/thrive/mcp', '/thrive/write/mcp', '/hive/mcp', '/hive/write/mcp', '/forage/mcp', '/forage/write/mcp']
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext

/** Enough of KVNamespace for the OAuth provider. */
function memoryKv() {
  const store = new Map<string, string>()
  return {
    async get(key: string, opts?: unknown) {
      const v = store.get(key)
      if (v === undefined) return null
      const type = typeof opts === 'string' ? opts : (opts as { type?: string } | undefined)?.type
      return type === 'json' ? JSON.parse(v) : v
    },
    async put(key: string, value: string) {
      store.set(key, typeof value === 'string' ? value : JSON.stringify(value))
    },
    async delete(key: string) {
      store.delete(key)
    },
    async list({ prefix = '' }: { prefix?: string } = {}) {
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }))
      return { keys, list_complete: true, cursor: '' }
    },
  }
}

function envFor(): Env {
  return {
    OAUTH_KV: memoryKv(),
    THRIVE_API_URL: 'https://x.test/thrive',
    THRIVE_API_KEY: 'k',
    HIVE_API_URL: 'https://x.test/hive',
    HIVE_API_KEY: 'k',
    FORAGE_API_URL: 'https://x.test/forage',
    FORAGE_API_KEY: 'k',
    WRITE_BUDGET: fakeBudget().namespace,
  } as unknown as Env
}

const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Register a public client, authorize the owner for `path`'s resource, and exchange the code for a token. */
async function tokenFor(env: Env, path: string): Promise<string> {
  const reg = await worker.fetch(
    new Request(`${PUBLIC_URL}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: 'test',
      }),
    }),
    env,
    ctx,
  )
  expect(reg.status, await reg.clone().text()).toBe(201)
  const { client_id } = (await reg.json()) as { client_id: string }

  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)).buffer)
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const resource = `${PUBLIC_URL}${path}`
  const authorize = new URL(`${PUBLIC_URL}/authorize`)
  for (const [k, v] of Object.entries({
    response_type: 'code',
    client_id,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 's',
    resource,
  })) {
    authorize.searchParams.set(k, v)
  }
  const oauth = authorizationServer.getOAuthApi(env)
  const request = await oauth.parseAuthRequest(new Request(authorize))
  const { redirectTo } = await oauth.completeAuthorization({
    request,
    userId: '42',
    metadata: {},
    scope: request.scope,
    props: { login: 'owner', id: 42 },
    revokeExistingGrants: false,
  })
  const code = new URL(redirectTo).searchParams.get('code')!

  const res = await worker.fetch(
    new Request(`${PUBLIC_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT,
        client_id,
        code_verifier: verifier,
        resource,
      }),
    }),
    env,
    ctx,
  )
  expect(res.status, await res.clone().text()).toBe(200)
  return ((await res.json()) as { access_token: string }).access_token
}

function listTools(path: string, token: string) {
  return new Request(`${PUBLIC_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
}

describe('a token is good only at the endpoint it was issued for', () => {
  it.each(ENDPOINTS)('a token for %s is accepted there and refused at the other five', async (issuedFor) => {
    const env = envFor()
    const token = await tokenFor(env, issuedFor)
    for (const path of ENDPOINTS) {
      const res = await worker.fetch(listTools(path, token), env, ctx)
      expect(res.status, `${issuedFor} token at ${path}`).toBe(path === issuedFor ? 200 : 401)
    }
  })
})
