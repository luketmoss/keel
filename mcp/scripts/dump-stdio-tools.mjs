// Records a stdio MCP server's tool list (names, descriptions, input schemas)
// so the Worker's port can be diffed against it after the stdio server is gone.
//
//   node scripts/dump-stdio-tools.mjs <server index.js> <out.json> [KEY=value ...]
//
// Extra KEY=value arguments become environment for the server, so it starts
// without real credentials.
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const [serverPath, outPath, ...assignments] = process.argv.slice(2)
if (!serverPath || !outPath) {
  console.error('usage: node scripts/dump-stdio-tools.mjs <server index.js> <out.json> [KEY=value ...]')
  process.exit(2)
}

const env = { ...process.env }
for (const a of assignments) {
  const i = a.indexOf('=')
  env[a.slice(0, i)] = a.slice(i + 1)
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(serverPath)],
  cwd: dirname(resolve(serverPath)),
  env,
})
const client = new Client({ name: 'dump-stdio-tools', version: '0.0.0' })
await client.connect(transport)
const { tools } = await client.listTools()
await client.close()

const slim = tools
  .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
  .sort((a, b) => a.name.localeCompare(b.name))
writeFileSync(outPath, JSON.stringify(slim, null, 2) + '\n')
console.log(`${slim.length} tools -> ${outPath}`)
