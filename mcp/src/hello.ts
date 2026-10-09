import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker'
import type { Props } from './env'

/** The spike's one tool: who the Worker thinks you are. */
export function buildHelloServer(props: Props): McpServer {
  // Ajv compiles schemas with `new Function`, which Workers forbid.
  const server = new McpServer(
    { name: 'keel-mcp-hello', version: '0.0.0' },
    { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  )
  server.registerTool(
    'whoami',
    { description: 'Return the GitHub login and numeric ID this connector signed in as.' },
    async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify({ login: props.login, id: props.id }) }],
    }),
  )
  return server
}

/** Stateless: a fresh server and transport per request, nothing held between calls. */
export async function handleHello(request: Request, props: Props): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await buildHelloServer(props).connect(transport)
  return transport.handleRequest(request)
}
