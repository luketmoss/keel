import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker'
import type { Env } from '../env'
import type { HiveConfig } from './api'
import { instructions, type Mode } from '../mode.js'
import { registerHiveTools } from './tools'

export function hiveConfig(env: Env): HiveConfig {
  return { apiUrl: env.HIVE_API_URL, apiKey: env.HIVE_API_KEY, defaultOwner: env.HIVE_DEFAULT_OWNER ?? '' }
}

export function buildHiveServer(cfg: HiveConfig, mode: Mode = 'read'): McpServer {
  // Ajv compiles schemas with `new Function`, which Workers forbid.
  const server = new McpServer(
    { name: mode === 'read' ? 'hive' : 'hive-write', version: '1.0.0' },
    { instructions: instructions('Hive', mode), jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  )
  registerHiveTools(server, cfg, mode)
  return server
}

/**
 * Stateless: a fresh server and transport per request, nothing held between calls.
 * `read` serves the read tools, `write` the write tools (#409); the two are disjoint.
 */
export async function handleHive(request: Request, env: Env, mode: Mode = 'read'): Promise<Response> {
  if (!env.HIVE_API_URL || !env.HIVE_API_KEY) {
    return new Response('Hive is not configured on this Worker.', { status: 503 })
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await buildHiveServer(hiveConfig(env), mode).connect(transport)
  return transport.handleRequest(request)
}
