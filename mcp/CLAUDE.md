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
│   ├── hive/           # /hive/mcp and /hive/write/mcp: api.ts (Apps Script client), tools.ts, index.ts
│   ├── thrive/         # /thrive/mcp and /thrive/write/mcp: the ported Thrive modules (JS) + index.ts
│   ├── mode.js         # read vs write: the reminder line and the endpoints' instructions
│   ├── call-context.js # state that belongs to one tool call (AsyncLocalStorage)
│   ├── consent.ts      # consent and message pages
│   ├── config.ts       # the Worker's public URL and resource URLs
│   └── env.ts          # the Env interface: every binding
├── test/               # `cloudflare:workers` stand-in; fixtures/ holds the retired
│                       # stdio servers' tool lists the ports are diffed against
├── docs/               # thrive-tools.md (reference), thrive-agent-brief.md
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
3. In claude.ai, add one custom connector per endpoint (the four below).

Each endpoint is its own OAuth resource, so a token issued for one is refused at
the others. To add an endpoint: a folder like `src/hive/`, an entry in
`resources` in `src/index.ts`, and its URL in `resources` of the authorization
server (`src/index.ts`) and `src/config.ts`.

## The four connectors (#409)

Each app has a read connector and a write connector. Their tool lists are
disjoint and together are exactly the app's tools.

| Connector | URL | Serves | Normal state |
|---|---|---|---|
| `Thrive` | `<PUBLIC_URL>/thrive/mcp` | the 10 read tools | on |
| `Thrive (write)` | `<PUBLIC_URL>/thrive/write/mcp` | the 12 write tools | **off** |
| `Hive` | `<PUBLIC_URL>/hive/mcp` | the 5 read tools | on |
| `Hive (write)` | `<PUBLIC_URL>/hive/write/mcp` | the 3 write tools | **off** |

**The write connectors are off unless you are writing.** claude.ai remembers the
toggle across chats, so turning `Thrive (write)` on to log a session leaves it on
in every later chat until you turn it off. Finish a writing session by switching
it off. The reminder at the end of every write is there to make forgetting
visible.

Why two endpoints: the Worker cannot see a conversation (both endpoints are
stateless and a token is per connector, not per chat), so the only per-chat
switch there is lives in claude.ai's "Search and tools". The split makes that
switch the write gate. Nothing the Worker does stops a write once the write
connector is on; the reminder and the endpoints' `instructions` only make that
state visible. Wording and edge cases:
[`docs/design/409-read-write-connectors.md`](docs/design/409-read-write-connectors.md).

- **Which tool is on which endpoint** is `READ_ONLY` in `src/thrive/tools.js`
  and `HIVE_READ_TOOLS` in `src/hive/tools.ts`; every other tool is a write tool.
  A new tool lands on the write endpoint unless it is added to those sets.
- **A successful write's result ends with** `— <App> (write) is on. Turn it off
  in Search and tools when you've finished writing.` A dry run, a refusal and a
  failed write do not carry it. "Wrote" is recorded where the request is sent
  (`markWrote()` in each app's `apiWrite`), per tool call.
- **After the deploy that ships this,** disconnect and reconnect `Thrive` and
  `Hive` once, so claude.ai drops their cached write tools.
- **Claude Code.** Not yet checked: whether a Claude Code session started in
  this repo lists the claude.ai write connectors while they are switched off in
  claude.ai. If it does, disable them in that session with `/mcp`. Record what
  was found here.

## Hive

`/hive/mcp` and `/hive/write/mcp` serve the 8 Hive tools between them, ported from the stdio server (retired in
#372) and diffed against the tool list recorded from it
(`test/fixtures/hive-stdio-tools.json`, a frozen contract: change a tool on
purpose, then update the fixture by hand). Secrets:
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

## Thrive

`/thrive/mcp` and `/thrive/write/mcp` serve the 22 Thrive tools between them, ported from the stdio server
(retired in #372) and diffed against the tool list recorded from it
(`test/fixtures/thrive-stdio-tools.json`, frozen the same way). The tool
reference and the agent brief are in `docs/thrive-tools.md` and
`docs/thrive-agent-brief.md`. The ported modules in `src/thrive/`
are plain JS with their original `node:test` suites (`npm run test:node`); only
`tools.test.js` changed, to build the server in-process instead of spawning it.
Secrets: `THRIVE_API_URL` and `THRIVE_API_KEY`, the MCP-only `MCP_API_KEY`, never
Thrive's `API_KEY` (the syncs hold that one).

Changes from the stdio server, all forced by running on a Worker:

- **Home time.** Relative dates (`today`, `+3d`) and a new workout's default time
  use America/Denver, the zone `domain.js` already treats as home. A Worker's
  clock is UTC, so reading local time would make every evening's "today" tomorrow.
- **A failed write says it may or may not have landed.** Writes are still sent
  once and never retried.
- The API URL and key come from `configureApi()` per request, not `process.env`.

A Thrive `apps-script/` change that alters a response shape also needs a matching
change here.

## Approving the destructive tools

The four tools below are on the write connector, `Thrive (write)`; approval is set
on that connector's tools.

`thrive_delete_workout`, `thrive_delete_exercise`, `thrive_update_template`
(it deletes the old rows) and `thrive_set_journal_entry` can destroy data
(clearing a note is a delete). Their dry-run-until-`confirm: true`
behaviour only prevents accidents; against prompt injection the one control is a
human approving each call.

**Approval is stored per device, not per connector.** Tapping "Always allow" on a
prompt switches it off on that device only, and a new device starts at the
default. So:

- **Never choose "Always allow" on those four tools, on any device.**
- On each device you use, set them to "Needs approval" in the connector's tool
  list, and check by calling one.

The four tools also carry `destructiveHint` (and every read tool
`readOnlyHint`), which a client may or may not honour; nothing relies on it.

