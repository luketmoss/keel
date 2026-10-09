import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker'
import type { Env } from '../env'
import { configureApi } from './api.js'
import { registerThriveTools } from './tools.js'

export function buildThriveServer(): McpServer {
  // Ajv compiles schemas with `new Function`, which Workers forbid.
  const server = new McpServer(
    { name: 'thrive', version: '1.0.0' },
    { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  )
  registerThriveTools(server)
  return server
}

/** Stateless: a fresh server and transport per request, nothing held between calls. */
export async function handleThrive(request: Request, env: Env): Promise<Response> {
  if (!env.THRIVE_API_URL || !env.THRIVE_API_KEY) {
    return new Response('Thrive is not configured on this Worker.', { status: 503 })
  }
  configureApi({ url: env.THRIVE_API_URL, key: env.THRIVE_API_KEY })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await buildThriveServer().connect(transport)
  return transport.handleRequest(request)
}
