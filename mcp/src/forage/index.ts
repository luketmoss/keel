import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker'
import type { Env } from '../env'
import type { ForageConfig } from './api'
import { budgetFor } from '../budget-do'
import { instructions, type Mode } from '../mode.js'
import { registerForageTools } from './tools'

export function forageConfig(env: Env, mode: Mode = 'read'): ForageConfig {
  if (mode !== 'write') return { apiUrl: env.FORAGE_API_URL, apiKey: env.FORAGE_API_KEY }
  // Only the write endpoint writes, so only it has a budget and a per-call ceiling (#410).
  const { budget, limits } = budgetFor(env, 'forage')
  return { apiUrl: env.FORAGE_API_URL, apiKey: env.FORAGE_API_KEY, budget, maxRowsPerCall: limits.maxRowsPerCall }
}

export function buildForageServer(cfg: ForageConfig, mode: Mode = 'read'): McpServer {
  // Ajv compiles schemas with `new Function`, which Workers forbid.
  const server = new McpServer(
    { name: mode === 'read' ? 'forage' : 'forage-write', version: '1.0.0' },
    { instructions: instructions('Forage', mode), jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  )
  registerForageTools(server, cfg, mode)
  return server
}

/**
 * Stateless: a fresh server and transport per request, nothing held between calls.
 * `read` serves the read tools, `write` the write tools (#713, as #409); the two are disjoint.
 */
export async function handleForage(request: Request, env: Env, mode: Mode = 'read'): Promise<Response> {
  if (!env.FORAGE_API_URL || !env.FORAGE_API_KEY) {
    return new Response('Forage is not configured on this Worker.', { status: 503 })
  }
  // Without its counter the write endpoint would be unlimited: refuse to serve it.
  if (mode === 'write' && !env.WRITE_BUDGET) {
    return new Response('Forage writes are not configured on this Worker (no write budget).', { status: 503 })
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await buildForageServer(forageConfig(env, mode), mode).connect(transport)
  return transport.handleRequest(request)
}
