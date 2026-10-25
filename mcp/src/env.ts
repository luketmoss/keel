/** Every binding the Worker reads. Add to this before reading `env.X`. */
export interface Env {
  /** Backs the OAuth provider's clients, grants and tokens. */
  OAUTH_KV: KVNamespace
  /** GitHub OAuth app client ID. Not secret. */
  GITHUB_CLIENT_ID: string
  /** GitHub OAuth app client secret. */
  GITHUB_CLIENT_SECRET: string
  /** The one GitHub numeric user ID allowed to sign in. */
  ALLOWED_GITHUB_ID: string
  /** Hive's Apps Script `/exec` URL. A secret only because the URL plus a key is full access. */
  HIVE_API_URL: string
  /** Hive's MCP-only API key (`MCP_API_KEY` in Hive's script properties). */
  HIVE_API_KEY: string
  /** Thrive's Apps Script `/exec` URL. A secret only because the URL plus a key is full access. */
  THRIVE_API_URL: string
  /** Thrive's MCP-only API key (`MCP_API_KEY` in Thrive's script properties). */
  THRIVE_API_KEY: string
  /** The hourly write counters (#410): one Durable Object per app, named `thrive` and `hive`. */
  WRITE_BUDGET: DurableObjectNamespace<import('./budget-do').WriteBudget>
  /** Write ceilings (#410), as vars. A missing or malformed value falls back to the default, never to "unlimited". */
  MAX_ROWS_PER_CALL?: string
  MAX_WRITES_PER_HOUR?: string
  MAX_ROWS_PER_HOUR?: string
}

/** What a granted token carries into the MCP handler. */
export interface Props {
  [key: string]: unknown
  login: string
  id: number
}
