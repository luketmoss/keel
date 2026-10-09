# CLAUDE.md — mcp

Remote MCP server for Thrive and Hive on Cloudflare Workers: one Worker, GitHub
sign-in limited to the owner, so both apps' tools are reachable from the phone,
the desktop app and Claude Code. The plan and its split are in
[luketmoss/keel#367](https://github.com/luketmoss/keel/issues/367).

**Stack:** worker. The authoritative conventions for this project are in
`.claude/skills/stack-worker/SKILL.md` — read it before writing code here.

Workspace rules live in the root `CLAUDE.md` and `CONVENTIONS.md`. This file
covers only what is specific to mcp.

## Layout

```
mcp/
├── wrangler.toml
├── .dev.vars.example   # every secret the Worker reads
├── src/
│   ├── index.ts        # authorization server + one resource server per MCP endpoint
│   ├── auth.ts         # /authorize, /callback, /health: consent, GitHub sign-in
│   ├── allow.ts        # the one-GitHub-user-ID gate
│   ├── github.ts       # GitHub OAuth calls and PKCE helpers
│   ├── hive/           # /hive/mcp: api.ts (Apps Script client), tools.ts, index.ts
│   ├── consent.ts      # consent and message pages
│   ├── config.ts       # the Worker's public URL and resource URLs
│   └── env.ts          # the Env interface: every binding
├── test/               # `cloudflare:workers` stand-in; fixtures/ holds the stdio
│                       # servers' tool lists the ports are diffed against
├── scripts/            # dump-stdio-tools.mjs regenerates those fixtures
└── docs/design/        # UX artifacts, one file per issue
```

## Sign-in

The Worker is its own OAuth authorization server (`@cloudflare/workers-oauth-provider`,
state in the `OAUTH_KV` namespace) and signs people in with GitHub. Only the
GitHub numeric user ID in the `ALLOWED_GITHUB_ID` secret gets a token; anyone
else sees "Not authorised" and no grant exists. The GitHub access token is used
once to read the user's ID and login, and is never stored.

Setup for a fresh account, once:

1. Create a GitHub OAuth app. Callback URL: `<PUBLIC_URL>/callback`. Put its
   client ID in `wrangler.toml` (`GITHUB_CLIENT_ID`).
2. `npx wrangler secret put GITHUB_CLIENT_SECRET` and
   `npx wrangler secret put ALLOWED_GITHUB_ID`.
3. In claude.ai, add one custom connector per endpoint, for example
   `<PUBLIC_URL>/hive/mcp`.

Each endpoint is its own OAuth resource, so a token issued for one is refused at
the others. To add an endpoint: a folder like `src/hive/`, an entry in
`resources` in `src/index.ts`, and its URL in `resources` of the authorization
server (`src/index.ts`) and `src/config.ts`.

## Hive

`/hive/mcp` serves the 8 Hive tools, ported from the stdio server and diffed
against its recorded tool list (`test/fixtures/hive-stdio-tools.json`). Secrets:
`HIVE_API_URL` and `HIVE_API_KEY`, where the key is Hive's MCP-only
`MCP_API_KEY`, never its `API_KEY`. `HIVE_DEFAULT_OWNER` is a var in
`wrangler.toml`. Errors reaching Hive come back as tool errors with the key and
URL scrubbed.

## Board

Project option: `mcp`. Filter the board by it to see only this project's work.

## Testing

Not human-gated. `/test` runs `npm run typecheck`, `npm test` and
`npm run build`. Criteria about the deployed Worker, the claude.ai connector or
the phone app are verified by hand against the deployed Worker and recorded in
the PR; the stack skill says how.

## Deploying

The Worker is named `keel-mcp` (`wrangler.toml`), so it serves at
`keel-mcp.<account-subdomain>.workers.dev`. The folder and board option stay
`mcp`.

Merge to `main` deploys, once the `CLOUDFLARE_API_TOKEN` repository secret
exists; until then the deploy job skips with a notice. Worker secrets are set
with `npx wrangler secret put`, never committed.
