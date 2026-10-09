import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker'
import type { Env } from '../env'
import type { HiveConfig } from './api'
import { registerHiveTools } from './tools'

export function hiveConfig(env: Env): HiveConfig {
  return { apiUrl: env.HIVE_API_URL, apiKey: env.HIVE_API_KEY, defaultOwner: env.HIVE_DEFAULT_OWNER ?? '' }
}

export function buildHiveServer(cfg: HiveConfig): McpServer {
  // Ajv compiles schemas with `new Function`, which Workers forbid.
  const server = new McpServer(
    { name: 'hive', version: '1.0.0' },
    { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  )
  registerHiveTools(server, cfg)
  return server
}

/** Stateless: a fresh server and transport per request, nothing held between calls. */
export async function handleHive(request: Request, env: Env): Promise<Response> {
  if (!env.HIVE_API_URL || !env.HIVE_API_KEY) {
    return new Response('Hive is not configured on this Worker.', { status: 503 })
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await buildHiveServer(hiveConfig(env)).connect(transport)
  return transport.handleRequest(request)
}
