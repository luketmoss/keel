# CLAUDE.md — auth

`@keel/auth`: Google browser sign-in that more than one Keel app needs — the GIS
token client, token and user storage, tap-armed renewal, Continue as <email>
and 401 reauth — as a framework-free TypeScript package. Extracted from Thrive's
sign-in (luketmoss/keel#608, part of #606).

**Stack:** web. The authoritative conventions for this project are in
`.claude/skills/stack-web/SKILL.md` — read it before writing code here. This
project is a library, so most of that skill does not apply: there is no view
library, no dev server, no Pages deploy and no `launch.json` entry, and `/test`
is `typecheck` and `test` alone. There is no `build` script.

Workspace rules live in the root `CLAUDE.md` and `CONVENTIONS.md`. This file
covers only what is specific to auth.

## Layout

```
auth/
├── package.json        # "@keel/auth"; exports src/index.ts
├── tsconfig.json
├── vitest.config.ts    # jsdom
├── src/
│   ├── index.ts        # the one entry point
│   ├── session.ts      # createAuthSession: GIS client, storage, renewal, state
│   ├── reauth.ts       # attemptReauth, ReauthFailedError: the 401 registry
│   └── session.test.ts
└── docs/design/        # UX artifacts, one file per issue
```

## No view library

**Nothing under `src/` imports `react`, `react-dom` or `preact`, or anything
from a consumer such as `thrive/`.** Thrive is Preact and Hive is Preact today,
but the package is shared logic, never shared components: an app mirrors the
session's state (`getState`, `subscribe`) into its own context and keeps its own
login screen.

## Consuming it

TypeScript source, no build step, nothing published. A consumer depends on it by
relative path and compiles it with its own Vite and Vitest:

```json
"@keel/auth": "file:../../auth"
```

and imports from the package name. The consumer's Vite config lists it in
`optimizeDeps.exclude` and `test.server.deps.inline`, as for `@keel/geo`, and its
workflows trigger on `auth/**`.

Each app creates one session with its own `storagePrefix` (Thrive: `gw_`, which
keeps phones signed in across the move). The prefix is the whole isolation
between apps; the keys are `<prefix>token`, `<prefix>user`, `<prefix>token_expiry`.

Consumers today: Thrive (`gw_`) and Hive (`hive_`, #609).

## Rules the session keeps

- Signed in means the user is known: a fresh sign-in becomes `token` and `user`
  together, only after `oauth2/v3/userinfo` returns 2xx with an `email`
  (luketmoss/hive#287, #289). Otherwise no token is kept and `renewError` is set.
- Renewal needs a tap: it is armed 10 minutes before expiry and on each return to
  the foreground, fired by the next `pointerup`, and quiet, so a failure keeps the
  old token. Only a failed `attemptReauth()` (a 401) signs out, keeping the user.
- One session is active for `attemptReauth` at a time: the one started last.

## Board

Project option: `auth`. Filter the board by it to see only this project's work.

## Testing

Automated. `/test` runs `npm run typecheck` and `npm test` and verifies
acceptance criteria against them; the delivery run continues through to Ready to
Ship without stopping. Nothing here is visual.
