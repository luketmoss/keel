import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker'
import type { Env } from '../env'
import { configureApi } from './api.js'
import { instructions, type Mode } from '../mode.js'
import { registerThriveTools } from './tools.js'

export function buildThriveServer(mode: Mode = 'read'): McpServer {
  // Ajv compiles schemas with `new Function`, which Workers forbid.
  const server = new McpServer(
    { name: mode === 'read' ? 'thrive' : 'thrive-write', version: '1.0.0' },
    { instructions: instructions('Thrive', mode), jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  )
  registerThriveTools(server, mode)
  return server
}

/**
 * Stateless: a fresh server and transport per request, nothing held between calls.
 * `read` serves the read tools, `write` the write tools (#409); the two are disjoint.
 */
export async function handleThrive(request: Request, env: Env, mode: Mode = 'read'): Promise<Response> {
  if (!env.THRIVE_API_URL || !env.THRIVE_API_KEY) {
    return new Response('Thrive is not configured on this Worker.', { status: 503 })
  }
  configureApi({ url: env.THRIVE_API_URL, key: env.THRIVE_API_KEY })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await buildThriveServer(mode).connect(transport)
  return transport.handleRequest(request)
}
