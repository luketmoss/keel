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
│   ├── index.ts        # fetch handler
│   └── env.ts          # the Env interface: every binding
└── docs/design/        # UX artifacts, one file per issue
```

## Board

Project option: `mcp`. Filter the board by it to see only this project's work.

## Testing

Not human-gated. `/test` runs `npm run typecheck`, `npm test` and
`npm run build`. Criteria about the deployed Worker, the claude.ai connector or
the phone app are verified by hand against the deployed Worker and recorded in
the PR; the stack skill says how.

## Deploying

Merge to `main` deploys, once the `CLOUDFLARE_API_TOKEN` repository secret
exists; until then the deploy job skips with a notice. Worker secrets are set
with `npx wrangler secret put`, never committed.
