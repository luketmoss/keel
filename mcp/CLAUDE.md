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
│   ├── budget.js       # the write ceilings as plain functions (window logic, wording, vars)
│   ├── budget-do.ts    # WriteBudget, the hourly counter's Durable Object
│   ├── undo-format.js  # the wording of thrive_undo and hive_undo
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
| `Thrive` | `<PUBLIC_URL>/thrive/mcp` | the 11 read tools | on |
| `Thrive (write)` | `<PUBLIC_URL>/thrive/write/mcp` | the 13 write tools | **off** |
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

## Write limits (#410)

Two ceilings, both enforced in the Worker, both per app. Their values are `[vars]`
in `wrangler.toml`; changing one is a one-line deploy. A missing or malformed
value falls back to the default, never to "unlimited" (`parseLimits` in
`src/budget.js`).

| What | Var | Default | When it is hit |
|---|---|---|---|
| Rows in one call (Thrive's bulk tools) | `MAX_ROWS_PER_CALL` | 200 | The call is previewed, nothing written: `CAP — nothing written. This would write N rows, over the 200-row limit for one call.`, then the summary a success would give, then `Call again with confirm: true to write them.` |
| Write calls per rolling 60 minutes | `MAX_WRITES_PER_HOUR` | 40 | Every write tool for that app is refused until the window moves on: `Write limit reached for Thrive: 40 writes in the last hour. Writing resumes at HH:MM (America/Denver). Reads still work.` |
| Rows per rolling 60 minutes | `MAX_ROWS_PER_HOUR` | 600 | The same refusal, naming rows |

- **Per-call ceiling.** `thrive_schedule_workout`, `thrive_schedule_week`,
  `thrive_update_sets` and `thrive_create_template` count the rows they are about
  to write from the plan they already validated, and gain an optional `confirm`
  that does nothing at or under the ceiling. The destructive tools keep their own
  dry runs. Hive writes touch one row each, so Hive has no per-call path.
- **Hourly budget.** The Worker cannot see sessions, so it is per app over an
  hour, not per session: a runaway loop lives inside one hour, and two sessions
  writing at once share the budget. There is **no `confirm` past it**, because a
  loop can send `confirm` as easily as anything else. Reads are never limited.
  A tool call is one write against it however many requests it sends, counted
  at its first request: a write whose request then fails still counts (it may
  have landed), a call refused before any request does not, and neither does a
  cap preview or `previewSetUpdates`.
- **Where the count lives.** One Durable Object per app (`WriteBudget`, binding
  `WRITE_BUDGET`, instance names `thrive` and `hive`), holding only
  timestamps and row counts, never arguments or values. KV was rejected: it is
  eventually consistent and takes one write per second per key, so a fast loop
  would slip past it. A write endpoint with no `WRITE_BUDGET` binding answers 503
  rather than run unlimited.
- **Undo** (#412), when it lands, counts as a write like any other.

## Undo (#412)

`thrive_undo` and `hive_undo` are write tools: they are served only on the write
endpoints, count against the write limits above, and carry the reminder on a
successful undo. They are thin: the apps hold the record and do the reverting
(`getChangeLog` and `undoCall` in Thrive's Apps Script, `getAuditLog` and
`undoCall` in Hive's, #434 and #457).

- **Every write request carries `call_id`.** The Worker mints one id per tool
  call (`crypto.randomUUID()`, in `call-context.js` with the rest of the call's
  state, never in a module variable) and sends it on every write request that
  call makes, so `thrive_schedule_week`'s `appendSets` chunks and each
  `createWorkout` are one undoable unit. Reads and `previewSetUpdates` carry none.
- `thrive_undo {}` / `hive_undo {}` list the last 20 MCP calls, newest first:
  `<call_id> · <YYYY-MM-DD HH:MM America/Denver> · <actions> · <n> rows`.
- `{ call_id }` is a dry run, `{ call_id, confirm: true }` reverts. If any row
  has changed since the call, the app refuses the whole call and the tool says
  `Nothing undone —` and lists every changed row. The dry run is not a write and
  is not counted; a confirmed undo counts as one write of as many rows as the
  dry run reported.
- An undo that fails in transit is sent once, says it may or may not have
  applied, and points at the list.
- **The tools need the apps deployed first.** They call actions the Apps Script
  projects only have after the owner deploys #434 (Thrive) and #457 (Hive), and
  every write now sends `call_id`, which Thrive's `upsertJournal` rejects as an
  unknown field until #434 is deployed. Deploy the Apps Script first, then this.
- Both are `destructiveHint` tools: reverting is a write that can itself destroy
  later work. They join the list under "Approving the destructive tools" below.

## Hive

`/hive/mcp` and `/hive/write/mcp` serve the 8 Hive tools between them, ported from the stdio server (retired in
#372) and diffed against the tool list recorded from it
(`test/fixtures/hive-stdio-tools.json`, a frozen contract: change a tool on
purpose, then update the fixture by hand). Secrets:
`HIVE_API_URL` and `HIVE_API_KEY`, where the key is Hive's MCP-only
`MCP_API_KEY`, never its `API_KEY`. `HIVE_DEFAULT_OWNER` is a var in
`wrangler.toml`. Errors reaching Hive come back as tool errors with the key and
URL scrubbed. `hive_update_item` accepts `completed_at` and forwards it untouched; the rule
(a date or zoned timestamp, only in a terminal column, not more than 24 h ahead) is Apps Script's
(#458), and `hive_get_item` / `hive_list_items` / the update reply show an item's completed date.
The Apps Script must be redeployed before the Worker that sends it: an old script ignores the
field and still answers success.

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

`/thrive/mcp` and `/thrive/write/mcp` serve the 24 Thrive tools between them, ported from the stdio server
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

**Drinks are read-only here (#522).** `thrive_drinks` reads Thrive Sip's log through
`getDrinks`, and `thrive_daily_summary` shows the summary's `water_ml` and
`alcohol_drinks`. No tool logs, edits or deletes a drink: the owner does that from
the widget or the app. So nothing here calls `logDrink`, `updateDrinkTime` or
`deleteDrink`, and the API's MCP change log (#434), which does not record those
actions, has nothing to miss from this Worker.

## Approving the destructive tools

The tools below are on the write connectors, `Thrive (write)` and `Hive (write)`;
approval is set on that connector's tools.

`thrive_delete_workout`, `thrive_delete_exercise`, `thrive_update_template`
(it deletes the old rows), `thrive_set_journal_entry` (clearing a note is a
delete) and `thrive_undo` can destroy data. `hive_undo` is the same
for Hive, and gets the same treatment. Reverting can itself destroy work done
since, so the app's conflict check is the first line and a human approval the second. Their dry-run-until-`confirm: true`
behaviour only prevents accidents; against prompt injection the one control is a
human approving each call.

**Approval is stored per device, not per connector.** Tapping "Always allow" on a
prompt switches it off on that device only, and a new device starts at the
default. So:

- **Never choose "Always allow" on those tools, `hive_undo` included, on any device.**
- On each device you use, set them to "Needs approval" in the connector's tool
  list, and check by calling one.

These tools also carry `destructiveHint` (and every read tool
`readOnlyHint`), which a client may or may not honour; nothing relies on it.

