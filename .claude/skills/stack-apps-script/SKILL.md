---
name: stack-apps-script
description: Conventions, scaffold, and CI for Google Apps Script backends in Keel (JavaScript, clasp, Vitest). Use when working in a project folder whose CLAUDE.md names apps-script as its stack.
---

# Apps Script stack

A Google Apps Script web app over a Google Sheet, pushed with `clasp`.
Authoritative for any component a project's `## Stacks` table names
`apps-script`. It is built from Thrive's `apps-script/` and its README, which
state the rules below at length; where this file and that README disagree about
a Thrive detail, the README is right about Thrive and this file is the bug.

Two things break the pipeline's usual assumptions. **Merging does not deploy**
— see Deploying — and **most of what can go wrong is on Google's side**, where
no test reaches — see Testing.

## Layout

```
<component>/
├── src/                  # flat *.js, plus the pinned appsscript.json manifest
├── tests/                # Vitest, and the sandbox harness
├── tsconfig.json         # for the harness and tests
├── vitest.config.ts
├── package.json
├── .claspignore          # keeps tests and package files out of the push
├── .clasp.json.example   # committed
└── .clasp.json           # gitignored: it holds the script id
```

- **Flat `src/*.js`.** Plain Apps Script: every file is evaluated into one
  shared global scope, with no modules and no exports. No source file may touch
  a Google global at load time — `SpreadsheetApp`, `PropertiesService` and the
  rest appear only inside function bodies — because the test sandbox loads them
  without those globals present.
- **`src/appsscript.json` is pinned**, including `oauthScopes`. Unpinned,
  Apps Script infers scopes from the services the code touches, and `DriveApp`
  widens to full `drive`.
- **`.clasp.json` is gitignored, `.clasp.json.example` committed.** The file
  holds the script id; its `rootDir` is `src`.
- **`.js` and `.mjs` are pinned to LF in the repository's `.gitattributes`**
  (`*.js text eol=lf`, `*.mjs text eol=lf`). Vitest cannot load a shebang
  script that checked out with CRLF.

## Testing

```bash
npm test           # vitest run
npm run typecheck  # tsc --noEmit
```

`npm test` loads the **real** `src/*.js` into a `node:vm` sandbox with the
Google globals stubbed, so a test cannot pass against a transcribed copy while
the source is broken. The sandbox's fake `SpreadsheetApp` sheet interprets
writes the way Sheets does: `appendRow` and `setValues` behave like typing into
a cell, so `"2026-03-04"` becomes a date, `"3720"` a number and `"=x"` a live
formula. That is the whole point of it. **Every write goes through the
text-escape helper** (`asText`, an apostrophe prefix, Sheets' own escape), and
a write that skips it must fail the suite. Reads use `getDisplayValues()`,
never `getValues()`, which is what the frontend sees.

Stub only what the sources use, and leave anything that changes behaviour to
the test — a stub missing by default fails loudly, which is the intent.

`npm run typecheck` checks the harness and the tests against
`@types/google-apps-script`. Its `tsconfig.json` has no `allowJs`, so it does
not check `src/*.js` itself; the sandbox tests are what exercise the source.

## Testing is partly human-gated

`/test` runs the suite and verifies what it can. Criteria that need the
**deployed** script cannot be checked in CI or from a session. They are listed
back explicitly, and the run stops in Testing rather than claiming them — the
same shape as mobile. If all of an issue's criteria are covered by the sandbox,
the run continues to Ready to Ship.

What `/test` cannot verify here, and how the owner proves each:

| Category | The owner proves it by |
|---|---|
| The 302 redirect and CORS behaviour | Calling the deployed URL: `curl -L` with `action=` and `key=`, and from a browser a `fetch` POST with a `URLSearchParams` body and no hand-set headers. Every call answers a 302 to `script.googleusercontent.com`; both hops must carry `Access-Control-Allow-Origin: *`. A request that needs a preflight fails, because there is no `doOptions` |
| Granted scopes | Running, in the editor, a function that uses the service. The editor prompts only for the scopes the function being run uses, so running `doGet` grants nothing new. A call needing an ungranted scope fails with a message naming it |
| Installed triggers | The editor's Triggers page, and the log line the install function writes. A trigger runs the **pushed** code, not a deployment |
| Script properties | Project Settings → Script Properties. Behaviour is proved by calling an action that reads the property: set answers, unset refuses |
| Lock contention | Two overlapping calls to an action that takes the script lock: the second waits, and past 30 s answers `Lock timeout` and writes nothing. Read the result in the Executions dashboard |
| Execution quotas | The Executions dashboard: runtime per execution, and the daily trigger runtime, which is shared by every script the owning account owns (90 minutes a day for time-driven triggers in Thrive's measure) |

An issue that touches `apps-script/` states in its acceptance criteria which of
these it needs. `/test` lists those criteria back; it does not mark them passed.

## Deploying

**Merged is not deployed here**, an exception to `CONVENTIONS.md` §Done. Apps
Script serves the last *deployed* version, not the last pushed one, and the
owner does both by hand. A session never runs `clasp push` or `clasp deploy`,
and CI does not either: that needs a clasp credential in repo secrets and has a
different failure model, so it is deliberately not automated.

The owner's steps, in order:

1. `clasp push` — sends `src/` to the script project.
2. Deploy → Manage deployments → edit the existing web-app deployment → New
   version → Deploy. The URL stays the same. A new deployment would change it,
   and every consumer holds the old one.
3. If a scope was added to `appsscript.json`, **re-authorize once**: the editor
   prompts only for the scopes the function being run uses, so signed in as the
   script's owner, open the script (`clasp open-script`), paste a throwaway
   function that calls the new service (`DriveApp.getRootFolder().getName()`
   for Drive), save, pick it, **Run** and allow the dialog. The grant belongs
   to the account and the script, not a deployment, so the live deployment uses
   it at once and needs no redeploy. Do not use the editor's Deploy button for
   this, which would publish the throwaway; the next `clasp push` removes it.

Two behaviours to plan around. A **trigger** runs the pushed code at once; the
**web app** runs only the deployed version. So a change that serves both needs
both steps, together.

**`## Results` lists the deploy an issue needs.** Every issue that changes
`apps-script/` ends its `## Results` with a `Deploy:` line naming the steps
above that apply — push, new version, re-authorization, install a trigger —
or saying that none is needed. The merge does not do them, and the Results are
the only place the owner will see that they are owed.

## Secrets

Script properties only, never source — the repository is public. Where each
kind is set:

| Kind | Where |
|---|---|
| The API key callers send, any second key, the spreadsheet id, the allowed account for token callers | Script properties: the editor's Project Settings → Script Properties, signed in as the account that owns the script |
| A token the script sends elsewhere (a GitHub dispatch token, say) | A script property too, set as the account that owns the script, read only by the one file that sends it, and sent only in the `Authorization` header |
| The key and URL a caller holds | The caller's own secret store: a GitHub Actions secret for a sync or Worker, never the script |
| The deployment URL alone, not a secret | A repository variable the frontend build reads |
| The script id | `.clasp.json`, gitignored |

Pin a token's reach to what the script needs — a fine-grained token on one
repository with the one permission — and give it an expiry date. An expired
token fails with only the upstream's refusal, and nothing else says so.

A browser cannot hold the key: a key in a public bundle is not a secret. A
browser app sends a Google access token instead, which the script checks
against its own client id and the one allowed account, and its allow-list of
actions is explicit: an action added later is refused to token callers until
someone names it.

## Changing a response shape or a column

The sheet's row layout is mirrored in more than one place — the frontend's
`api/types.ts`, and the Worker's client in `mcp/src/<app>/`. A change to a
response shape or a column therefore changes all of them in **the same pull
request**: the Apps Script source, the frontend mirror, and the MCP Worker's
client.

- **Columns are appended, never moved.** Callers address columns by position,
  and the script is deployed separately from them; a new column goes after the
  last one, so a caller that predates it still reads every column it knew.
- **Deploy order: Apps Script first**, then the callers. A caller deployed
  before the script it depends on talks to the old shape.
- **A pull request touching `mcp/` is human-reviewed (#393).** The delivery run
  parks it in Ready to Ship rather than merging.

The Worker's own conventions are `stack-worker`'s; this file owns only the
API it calls.

## CI

One job per component in the project's `<slug>.yml`, in the form
`CONVENTIONS.md` §Continuous integration defines for multi-component projects:
Node 20, `npm ci`, `npm test`, `npm run typecheck`, run from
`<slug>/<component>`, with no deploy step. The job is in
[scaffold.md](scaffold.md), beside this file.

## Scaffold

The component scaffold — tree, `package.json`, `tsconfig.json`,
`vitest.config.ts`, a sandbox helper with an example test, `.claspignore`,
`.clasp.json.example`, `appsscript.json` — and the CI job are in
[scaffold.md](scaffold.md). `/new-project` reads it when a component is
created; nothing in the issue lifecycle does, which is why it is not here.
