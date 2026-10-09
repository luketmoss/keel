import { OAuthAuthorizationServer, OAuthResourceServer } from '@cloudflare/workers-oauth-provider'
import { handleAuth } from './auth'
import { HIVE_RESOURCE, PUBLIC_URL } from './config'
import type { Env, Props } from './env'
import { handleHive } from './hive'

/**
 * The Worker is its own OAuth authorization server, and each MCP endpoint is a
 * separate protected resource. Separate audiences are the point: a token issued
 * for /hive/mcp is refused at any other endpoint.
 */
const authorizationServer = new OAuthAuthorizationServer<Env>({
  issuer: PUBLIC_URL,
  resources: [HIVE_RESOURCE],
  clientRegistrationEndpoint: '/oauth/register',
  clientIdMetadataDocumentEnabled: true,
})

const validateToken = (env: Env) => (resource: string, token: string) =>
  authorizationServer.validateToken<Props>(resource, token, env)

function mcpResource(resource: string, handle: (request: Request, env: Env) => Promise<Response>) {
  return new OAuthResourceServer<Env, Props>({
    resourceMetadata: { resource, authorization_servers: [PUBLIC_URL] },
    validateToken,
    handler: {
      async fetch(request: Request, env: Env) {
        try {
          return await handle(request, env)
        } catch (err) {
          console.error('mcp error', err instanceof Error ? err.message : err)
          return new Response('Internal error', { status: 500 })
        }
      },
    },
  })
}

/** Add a resource here with its own path; routing and metadata follow from it. */
const resources = [{ path: new URL(HIVE_RESOURCE).pathname, server: mcpResource(HIVE_RESOURCE, handleHive) }]

const WELL_KNOWN = '/.well-known/oauth-protected-resource'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url)

    for (const { path, server } of resources) {
      if (pathname === path || pathname.startsWith(`${path}/`) || pathname === `${WELL_KNOWN}${path}`) {
        return server.fetch(request, env, ctx)
      }
    }

    // Application routes: the consent page, the GitHub callback, health.
    if (pathname === '/authorize' || pathname === '/callback' || pathname === '/health') {
      try {
        return await handleAuth(request, env, authorizationServer.getOAuthApi(env))
      } catch (err) {
        console.error('auth error', err instanceof Error ? err.message : err)
        return new Response('Internal error', { status: 500 })
      }
    }

    // Discovery, token, revocation and client registration.
    return authorizationServer.fetch(request, env, ctx)
  },
}
