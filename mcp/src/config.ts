/**
 * The Worker's public origin. The OAuth provider needs it when it is
 * constructed, before any request or `env` exists, so it cannot come from a
 * binding. Change it here if the Worker is ever renamed or given a domain.
 */
export const PUBLIC_URL = 'https://keel-mcp.luketmossbot.workers.dev'

export const HIVE_RESOURCE = `${PUBLIC_URL}/hive/mcp`
