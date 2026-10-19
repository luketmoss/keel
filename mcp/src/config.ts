/**
 * The Worker's public origin. The OAuth provider needs it when it is
 * constructed, before any request or `env` exists, so it cannot come from a
 * binding. Change it here if the Worker is ever renamed or given a domain.
 */
export const PUBLIC_URL = 'https://keel-mcp.luketmossbot.workers.dev'

export const HIVE_RESOURCE = `${PUBLIC_URL}/hive/mcp`
export const THRIVE_RESOURCE = `${PUBLIC_URL}/thrive/mcp`
/** #409: the write tools of each app, on their own resource, so a token for one never reaches the other. */
export const HIVE_WRITE_RESOURCE = `${PUBLIC_URL}/hive/write/mcp`
export const THRIVE_WRITE_RESOURCE = `${PUBLIC_URL}/thrive/write/mcp`
