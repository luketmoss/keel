---
name: stack-worker
description: Conventions, scaffold, and CI for Cloudflare Workers projects in Keel (TypeScript, wrangler, vitest). Use when working in a project folder whose CLAUDE.md names worker as its stack.
---

# Worker stack

TypeScript on Cloudflare Workers, built and deployed with `wrangler`.
Authoritative for any project whose CLAUDE.md names `worker`.

## Testing

**Not human-gated.** `/test` runs `npm run typecheck`, `npm test` and
`npm run build`, and the delivery run continues to Ready to Ship without
stopping. Nothing here needs hardware.

What the suite proves is the Worker's own logic, called as a plain function.
What it does not prove is anything that only exists on Cloudflare's runtime:
Durable Objects, KV, the real `workerd` limits, a live OAuth round trip. Where an
acceptance criterion depends on one of those, say so in `/test` instead of
passing it from a unit test. A criterion about a claude.ai connector, the phone
app, or a deployed URL is verified by hand against the deployed Worker, and
recorded in the PR.

## Conventions

- TypeScript, `strict` on. `any` requires a comment saying why
- The entry point is a module Worker: `export default { fetch(request, env, ctx) }`.
  No service-worker syntax
- **Handlers are plain functions of `(request, env)`.** Tests call them
  directly, with a hand-built `env`, so nothing in the suite needs `workerd`
- Every binding is typed in one `Env` interface in `src/env.ts`. A binding read
  anywhere else as `env.SOMETHING` without being declared there is a bug
- Vitest for tests, in the default Node environment, colocated beside the code
- CI runs Node 22: current wrangler refuses to run on 20, and the failure
  surfaces only at the `build` step
- `compatibility_date` is pinned in `wrangler.toml` and moved deliberately,
  never left to drift; `nodejs_compat` is added only when a dependency needs it
- Errors become responses. A Worker that throws returns an opaque 1101 page
  and logs nowhere useful, so catch at the edge and return a status and a
  message

## Secrets and configuration

| Kind | Where | How |
|---|---|---|
| Not secret (URLs, client IDs, defaults) | `[vars]` in `wrangler.toml` | committed |
| Secret (API keys, OAuth client secret, signing keys) | Worker secret | `npx wrangler secret put NAME` |
| Local development | `.dev.vars` | gitignored; `.dev.vars.example` is committed |

**A secret never appears in the repo, in `wrangler.toml`, in a response, or in a
log line.** The same holds for a key's prefix or length: log that a key was
present, not what it was.

`.dev.vars.example` lists every secret the Worker reads, one per line with a
comment saying what it is and where to get one. Keep it exhaustive — a secret the
code reads and the file omits is a fresh clone that fails with no way to tell
why.

## Deploying

**Merge to `main` deploys; a pull request never does.** The workflow's `deploy`
job runs only on pushes to `main`, after the `check` job passes, using the
`CLOUDFLARE_API_TOKEN` repository secret (and `CLOUDFLARE_ACCOUNT_ID` if the
token spans accounts). Create the token from Cloudflare's "Edit Cloudflare
Workers" template, scoped to the one account and nothing else.

Until `CLOUDFLARE_API_TOKEN` exists the `deploy` job skips with a notice rather
than failing. A repository without the secret is a repository that has not been
set up yet, not a broken build, and a permanently red `main` teaches everyone to
ignore it.

Secrets set with `wrangler secret put` live on Cloudflare and are not touched by
a deploy. Setting one is a deliberate step by the person who owns the account.

## Verifying a deployed Worker

Read state off the wire, not off the screen. `curl -i` the endpoint and assert on
the status line and headers; a screenshot never answers *does it return 401*.
`npx wrangler tail` streams the Worker's live logs and is the first place to look
when a deployed Worker behaves differently from its tests.

## Scaffold and CI

The project scaffold and the CI workflow template are in
[scaffold.md](scaffold.md), beside this file. `/new-project` reads it when a
project is created; nothing in the issue lifecycle does, which is why it is
not here.
