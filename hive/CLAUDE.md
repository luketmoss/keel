# CLAUDE.md — hive

Family Kanban board for two people, using a Google Sheet as the data layer.
There are two doors into the one sheet:

- **frontend/** — a Preact SPA (Vite) that reads and writes the Sheets REST API
  directly with the signed-in user's Google token
- **apps-script/** — a Google Apps Script API (clasp), the second door, for the
  MCP Worker, which has no browser OAuth token

Workspace rules live in the root `CLAUDE.md` and `CONVENTIONS.md`: the board,
the pipeline and its skills, and CI. This file covers only what is specific to
Hive.

## History

Hive moved here from `luketmoss/hive` in #442: imported with its history, its
process skills and board left behind. The old repo is frozen until #445
archives it. Its closed issues stay there and are cited `luketmoss/hive#N`
(the two still open moved here, below); a bare `#N` in Keel is a Keel issue. Imported commit messages were rewritten to the
qualified form. The hundreds of bare `#N` in code comments and test names were
not: they predate the move and mean `luketmoss/hive#N`.

What runs where today: the app is live only at
`https://luketmoss.github.io/keel/hive/`, built by `hive-pages.yml` from
`hive/frontend` on a push to `main`. The old URL
`https://luketmoss.github.io/hive/` is a redirect since #444
(luketmoss/hive#302): the old repo's Pages publishes a static page that sends
`/hive/<rest>` to `/keel/hive/<rest>` with the query and hash kept, and no
longer builds the app. Both addresses share the origin, so sign-in and
`localStorage` carried over. `hive-pages.yml` shares the `gh-pages` concurrency
group with cairn's and Thrive's workflows; GitHub keeps one pending run per
group, so if three deploys queue together the middle one is dropped, and
`workflow_dispatch` is the recovery. The Apps Script deployment and its trigger
are unchanged by the move.

Board #2 (Hive's old project board) is closed, with its 145 items left as they
were. The issues still open in `luketmoss/hive` were transferred to Keel in
#444, so their old links redirect and their sub-issue links followed; a bare
`#278` or `#279` in a code comment or note means the old number:

| Old | Keel | Issue |
|---|---|---|
| luketmoss/hive#278 | #457 | Record every MCP write in the Audit Log, with undo (under #408) |
| luketmoss/hive#279 | #458 | Hive MCP returns and edits an item's completed date (with #450) |

Every other `luketmoss/hive#N` was closed before the move and stays there.
#445 archives the old repo and updates this section again.

## Stacks

| Path | Stack |
|---|---|
| `frontend/` | web |
| `apps-script/` | apps-script |

**View library:** preact

The authoritative conventions for each component are in its stack skill:
`.claude/skills/stack-web/SKILL.md` and
`.claude/skills/stack-apps-script/SKILL.md`. Paths outside both, such as
`docs/design/` and this file, get the workspace rules and this file.

## Key commands

- `npm --prefix frontend run dev` — Vite dev server on port 5176, at
  `http://localhost:5176/`
- `cd frontend && npm test` / `npm run typecheck` / `npm run build`
- `cd apps-script && npm test` / `npm run typecheck` — sandboxed `node:vm`
- The user's terminal is PowerShell 5.1 — no `&&`; use `;` or separate commands

## Change both together

Hive is one repository now, so each pair below changes in **one pull request**.

- **The business rules and the row mapping.** `frontend/src/state/rules.ts` and
  `apps-script/src/rules.js`; `frontend/src/api/types.ts` and
  `apps-script/src/types.js`. Change them together or the two doors disagree
  about what a move means.
- **Response shapes.** A change to `apps-script/` that alters a response shape
  also changes the MCP Worker's client in `mcp/src/hive/` (`tools.ts`,
  `api.ts`) and the frozen fixture `mcp/test/fixtures/hive-stdio-tools.json`,
  or the Worker's tools break silently. A pull request touching `mcp/` is
  human-reviewed (#393).

## Changing the schema

**Frozen.** No schema or API-shape change from the merge of #442 until #439
closes.

After that, a column or tab changes only like this:

1. **Columns are appended, never moved.** The API, the frontend and the Worker
   read tabs by column position.
2. The API (`apps-script/`), the frontend mirror (`frontend/src/api/`) and the
   Worker (`mcp/src/hive/`) change in the same pull request.
3. **Apps Script deploys first**, then its callers. Merging does not deploy it;
   the steps are the owner's, below.

## Apps Script deployment

The owner runs every step here; a session never runs `clasp` (`stack-apps-script`).

- **Live project: "Hive API"**, script ID
  `11J1aR_JwYWmobNTj8w1kbFCac3mAKrUt4sRdgcrIhUB5ROCSQn4whU08`.
  `apps-script/.clasp.json` is gitignored (`.clasp.json.example` is the
  template), so this line is the only committed record of it.
- Access must stay **"Anyone" (`ANYONE_ANONYMOUS`)**, executing as the
  deployer. The MCP Worker calls with a plain `fetch` and an API key, no Google
  sign-in; "Anyone with a Google account" 302s it to a login page. The `webapp`
  block in `src/appsscript.json` is what keeps this — `clasp push --force`
  overwrites the server manifest with the local one, so it must stay there.
- **Shipping a change:** `cd apps-script`, `clasp push --force`, then
  `clasp redeploy AKfycbwR-PP8Mg41pVEoMsLxYDMMMmr3yufaApRlymItvBv37-ZKRmdPm03R_eVzr_G2Lnza --description "..."`,
  which cuts a new version on the live deployment and keeps its URL. Roll back
  with the same command and `-V <previous version>`. A push alone does not move
  the deployment.
- **`clasp deploy` is never used.** It creates a new deployment with a new URL,
  and the consumer holding the old one breaks.
- **The consumer of the URL** is the MCP Worker's `HIVE_API_URL` secret
  (`wrangler secret put`, in `mcp/`).

### Script properties and the one trigger

Set in the editor's Project Settings → Script Properties, signed in as the
account that owns the script. Named here, never valued:

- `SPREADSHEET_ID` — the "Hive Board" sheet
- `MCP_API_KEY` — the one credential, the MCP Worker's: a caller's `key` must
  equal it. Unset or empty, every call throws, so a misconfigured deployment is
  loud rather than quietly rejecting everyone
- `SNAPSHOT_FOLDER_ID` — the Drive folder the daily snapshot writes to

**There is one installed trigger, so this is not "no triggers".** The daily
snapshot (luketmoss/hive#294): `installSnapshotTrigger()`, run once by the owner
in the editor, installs a time-driven trigger that runs `takeSnapshot` at about
03:00 America/Denver. It copies the sheet to `Hive snapshot YYYY-MM-DD` in the
`SNAPSHOT_FOLDER_ID` folder and keeps the newest 60. `removeSnapshotTrigger()`
removes it. A trigger runs the **pushed** code, not a deployment, so a drifted
`clasp push` changes what the snapshot does at 03:00 even before any redeploy.

## Environment
- **Windows machine** — `jq` is NOT available. Use `gh`'s built-in `--jq` flag. Never pipe to a standalone `jq`.
- Node 20+, npm (`.nvmrc` pins 20)
- `hive/.gitattributes` pins `*.js`, `*.mjs` and `*.sh` to LF: vitest cannot load a shebang script checked out with CRLF, and bash rejects a CRLF `apps-script/tests/smoke.sh`

## Architecture Notes
- Frontend uses direct `fetch()` to the Sheets REST API (not gapi.client)
- Auth: Google Identity Services (GIS) token model; `withReauth()` wraps every Sheets call and retries once on an expired token
- State: @preact/signals — module-level `signal()`/`computed()`. `useState` only for component-local state
- Demo mode is gated at the app/state layer (`frontend/src/demo/`, `app.tsx`, `auth-provider.tsx`, `state/actions-*`), **not** inside each API function
- Drag and drop: HTML5 native, no library
- Styling: CSS custom properties in `global.css`. No framework, no CSS modules. Breakpoints at 768px, 600px and 480px; `data-theme="dark"` for dark mode
- Apps Script is `.js`, not TypeScript — clasp's transpilation was unreliable. All operations go through `doGet()` with a `payload` query param, because POST is broken for anonymous callers
- Always online, no offline cache. 30-second poll for sync (`app.tsx`), which is enough for two users

## Preview & Demo Mode
`preview_start` with the **`hive`** launch config (the root
`.claude/launch.json`), then navigate to
`http://localhost:5176/?demo=true`.

Demo mode needs both `VITE_DEMO_MODE=true` (build-time: `cp .env.example
.env.local` in `frontend/` sets it) and `?demo=true` (runtime). Both are checked
in `is-demo-mode.ts`, which is why leaving the env var on permanently is safe.

It auto-authenticates — no login screen, no OAuth popup. Changes are not
persisted; reloading restores the original demo set. A real sign-in on port
5176 needs that origin added to the Google OAuth client, which is the owner's
call; demo mode needs none.

Cloud sessions have no Browser pane. There,
`node .keel/look.mjs hive "/?demo=true" --env VITE_DEMO_MODE=true` drives
the same demo app with the container's Playwright and Chromium
(`stack-web` § Verifying a browser UI).

### Driving the preview
- Prefer `read_page` or `javascript_tool` over screenshots when checking a specific element or a computed value — a screenshot cannot tell you a contrast ratio
- `computer` clicks are unreliable on signal-driven components; use `javascript_tool` with `.click()` instead
- Native input value setters do not trigger signal updates; use `form_input`
- Batch DOM checks into one `javascript_tool` IIFE rather than many calls
- `computer` with `action: "screenshot"` for visual evidence, `resize_window` for the 375px breakpoint
- Enumerating CSS media queries from JS fails under Vite's bundling — read the CSS instead

## Data Model
Google Sheet "Hive Board", 7 tabs. Row 1 is headers everywhere; reads start at
`A2`. Every entity carries the `sheetRow` it came from, which is how updates and
deletes find it again.

- **Items** (`A:N`, 14 columns): id, title, description, status, owner, due_date,
  labels, parent_id, created_at, updated_at, completed_at, sort_order,
  created_by, board_id
- **Owners** (`A:B`): name, email
- **Labels** (`A:C`): label, color, board_id
- **Boards** (`A:F`): ID, Name, Created At, Created By, Color, Icon
- **Permissions** (`A:C`): Board ID, User Email, Role
- **Statuses** (`A:G`): id, board_id, name, sort_order, color, is_terminal, created_at
- **Audit Log** (`A:G`, append-only): timestamp, item_id, action, field, old_value, new_value, actor

### Invariants
- **Row deletion runs bottom-to-top.** Deleting top-down shifts every row beneath
  it and the next delete hits the wrong record. `sheets.ts` sorts descending
  before deleting — keep it that way.
- **Columns are per-board rows in `Statuses`, not an enum.** The `VALID_STATUSES`
  constant and `STATUS_COL` comment in `apps-script/src/types.js` say
  "deprecated"; the sheet is still read and written at `Statuses!A2:G` and is the
  live source. Treat the comment as stale, not the tab.
- **`completed_at` is driven by `is_terminal`, never by a column's name.**
  `applyStatusSideEffects` sets it entering a terminal column and clears it
  leaving one. A board can call its terminal column anything.
- **The Audit Log is append-only.** A deliberate forensic trail, not dead
  weight to be tidied away. The frontend only appends to it; its one reader is
  the API's `getAuditLog` action (luketmoss/hive#239).
- **`parent_id` makes sub-items**, and a sub-item lives in the same `Items` tab
  as its parent. There is no separate sheet.
- **No formula-injection sanitizer exists.** Nothing prefixes `'` to input
  starting with `=`, `+`, `-`, `@` or tab. The hardening issue that would have
  added one, luketmoss/hive#87, was closed as not planned. Do not block a PR for
  missing a convention the project does not have; a real need for it is a new
  Keel issue.

## UX Design Decisions
Respected by every agent. Add to this list when a decision gets made, so it
stops being re-litigated three issues later.

- **Desktop-first Kanban**, responsive down to 375px — the inverse of a
  mobile-first app, because the board is the primary surface
- **Native HTML5 drag and drop** on desktop; touch drag is a separate concern
  (luketmoss/hive#122) and not a reason to add a library
- **Touch targets ≥ 44×44px** — WCAG 2.5.5
- **Light and dark** via `data-theme`; every new color goes through a custom
  property in `global.css`, never a literal
- **Grouping is one menu**, not a view toggle (luketmoss/hive#230)
- **Per-board columns** — boards define their own statuses (luketmoss/hive#218)
