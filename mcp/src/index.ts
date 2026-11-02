import { OAuthResourceServer } from '@cloudflare/workers-oauth-provider'
import { handleAuth } from './auth'
import {
  FORAGE_RESOURCE,
  FORAGE_WRITE_RESOURCE,
  HIVE_RESOURCE,
  HIVE_WRITE_RESOURCE,
  PUBLIC_URL,
  THRIVE_RESOURCE,
  THRIVE_WRITE_RESOURCE,
} from './config'
import type { Env, Props } from './env'
import { handleForage } from './forage'
import { handleHive } from './hive'
import { authorizationServer } from './oauth'
import { handleThrive } from './thrive'

// The hourly write counter (#410). Cloudflare finds a Durable Object class on the entry module.
export { WriteBudget } from './budget-do'

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
const resources = [
  { path: new URL(HIVE_RESOURCE).pathname, server: mcpResource(HIVE_RESOURCE, handleHive) },
  { path: new URL(THRIVE_RESOURCE).pathname, server: mcpResource(THRIVE_RESOURCE, handleThrive) },
  // #409: each app's write tools, on a resource of their own.
  {
    path: new URL(HIVE_WRITE_RESOURCE).pathname,
    server: mcpResource(HIVE_WRITE_RESOURCE, (request, env) => handleHive(request, env, 'write')),
  },
  {
    path: new URL(THRIVE_WRITE_RESOURCE).pathname,
    server: mcpResource(THRIVE_WRITE_RESOURCE, (request, env) => handleThrive(request, env, 'write')),
  },
  // #713: Forage, read and write.
  { path: new URL(FORAGE_RESOURCE).pathname, server: mcpResource(FORAGE_RESOURCE, handleForage) },
  {
    path: new URL(FORAGE_WRITE_RESOURCE).pathname,
    server: mcpResource(FORAGE_WRITE_RESOURCE, (request, env) => handleForage(request, env, 'write')),
  },
]

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
