import OAuthProvider from '@cloudflare/workers-oauth-provider'
import { handleAuth } from './auth'
import { HELLO_RESOURCE, PUBLIC_URL } from './config'
import type { Env, Props } from './env'
import { handleHello } from './hello'

export default new OAuthProvider<Env>({
  apiRoute: '/hello/mcp',
  apiHandler: {
    async fetch(request: Request, _env: Env, ctx: ExecutionContext) {
      try {
        return await handleHello(request, (ctx as unknown as { props: Props }).props)
      } catch (err) {
        console.error('mcp error', err instanceof Error ? err.message : err)
        return new Response('Internal error', { status: 500 })
      }
    },
  },
  defaultHandler: {
    async fetch(request: Request, env: Env) {
      try {
        return await handleAuth(request, env)
      } catch (err) {
        console.error('auth error', err instanceof Error ? err.message : err)
        return new Response('Internal error', { status: 500 })
      }
    },
  },
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/oauth/register',
  clientIdMetadataDocumentEnabled: true,
  resourceMetadata: {
    resource: HELLO_RESOURCE,
    authorization_servers: [PUBLIC_URL],
  },
})
