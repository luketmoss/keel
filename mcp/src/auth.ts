import {
  AuthorizationError,
  CimdFetchError,
  authorizationErrorRedirect,
} from '@cloudflare/workers-oauth-provider'
import { isAllowedGithubUser } from './allow'
import { consentPage, messagePage } from './consent'
import type { Env, Props } from './env'
import { exchangeForUser, githubAuthorizeUrl, newVerifier, s256 } from './github'

/** The default handler: everything that is not the MCP endpoint itself. */
export async function handleAuth(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url)
  try {
    if (pathname === '/health') return new Response('ok')
    if (pathname === '/authorize') {
      return request.method === 'POST' ? await approve(request, env) : await showConsent(request, env)
    }
    if (pathname === '/callback') return await callback(request, env)
    return new Response('Not found', { status: 404 })
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) {
      return Response.redirect(error.redirectTo, 302)
    }
    if (error instanceof AuthorizationError) {
      return messagePage('Cannot continue', error.description, 400)
    }
    if (error instanceof CimdFetchError) {
      return messagePage('Cannot continue', 'This app could not be verified.', 400)
    }
    throw error
  }
}

async function showConsent(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER
  const authRequest = await oauth.parseAuthRequest(request)
  const details = await oauth.describeConsent(authRequest)
  const consent = await oauth.beginConsent(authRequest)
  const headers = new Headers(consent.headers) // binding cookie, no framing, no caching
  headers.set('Content-Type', 'text/html; charset=utf-8')
  return new Response(consentPage(details, consent.handle), { headers })
}

async function approve(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER
  const form = await request.formData()
  const handle = String(form.get('handle') ?? '')

  if (form.get('decision') === 'deny') {
    const denied = await oauth.denyConsent(request, handle)
    denied.headers.set('Location', denied.redirectTo)
    return new Response(null, { status: 302, headers: denied.headers })
  }

  const approved = await oauth.approveConsent(request, handle)
  const verifier = newVerifier()
  const { state, headers } = await oauth.beginUpstream(approved.request, {
    data: { verifier }, // returned at the callback; never sent to GitHub
    headers: approved.headers,
  })
  headers.set('Location', githubAuthorizeUrl(env.GITHUB_CLIENT_ID, state, await s256(verifier)))
  return new Response(null, { status: 302, headers })
}

async function callback(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER
  const { request: original, data, headers } = await oauth.finishUpstream<{ verifier: string }>(request)
  const code = new URL(request.url).searchParams.get('code')

  if (new URL(request.url).searchParams.get('error') || !code) {
    headers.set('Location', authorizationErrorRedirect(original, 'access_denied'))
    return new Response(null, { status: 302, headers })
  }

  const user = await exchangeForUser(code, data.verifier, env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET)

  // The gate. No grant is created, so no token exists, for anyone else.
  if (!isAllowedGithubUser(user.id, env.ALLOWED_GITHUB_ID)) {
    return messagePage('Not authorised', 'This GitHub account is not allowed to use this server.', 403)
  }

  const props: Props = { login: user.login, id: user.id }
  const { redirectTo } = await oauth.completeAuthorization({
    request: original,
    userId: String(user.id),
    metadata: {},
    scope: original.scope,
    props,
  })
  headers.set('Location', redirectTo)
  return new Response(null, { status: 302, headers })
}
