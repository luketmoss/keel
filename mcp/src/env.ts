import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'

/** Every binding the Worker reads. Add to this before reading `env.X`. */
export interface Env {
  /** Backs the OAuth provider's clients, grants and tokens. */
  OAUTH_KV: KVNamespace
  /** Injected by the OAuth provider into the default handler. */
  OAUTH_PROVIDER: OAuthHelpers
  /** GitHub OAuth app client ID. Not secret. */
  GITHUB_CLIENT_ID: string
  /** GitHub OAuth app client secret. */
  GITHUB_CLIENT_SECRET: string
  /** The one GitHub numeric user ID allowed to sign in. */
  ALLOWED_GITHUB_ID: string
}

/** What a granted token carries into the MCP handler. */
export interface Props {
  [key: string]: unknown
  login: string
  id: number
}
