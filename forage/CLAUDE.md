# CLAUDE.md — forage

Menu planning, recipes, shopping and a food log for two people, with a Google
Sheet as the data layer, in two components:

- **frontend/** — a Preact SPA (Vite)
- **apps-script/** — a Google Apps Script API (clasp), the one Forage API that
  the app and the MCP tools both write through

Workspace rules live in the root `CLAUDE.md` and `CONVENTIONS.md`: the board,
the pipeline and its skills, and CI. This file covers only what is specific to
Forage.

## History

Forage is a rebuild inside Keel (epic #700), not a port. It began in
`luketmoss/forage`, which is frozen and still serves the old app at
`https://luketmoss.github.io/forage/` until the cutover (#715). No git history
was imported: the code here is written fresh, and the only files carried over
are reference copies in `docs/reference/` (below). A bare `#N` in Keel is a
Keel issue; the old repo's issues are cited `luketmoss/forage#N`.

`docs/reference/` holds, as reference only, the old Worker's JSON-LD recipe
extractor and its test (`parsing.ts`, `parsing.test.ts`, from
`worker/src/` at `luketmoss/forage@e6dc1ae`) and the old app's five icons
(`icons/`). Neither component compiles or tests them. #706 moves the extractor
into code and #702 starts from the icons.

Nothing is deployed from this folder yet: there is no Pages workflow (#705), no
Apps Script project and no Sheet (the owner's steps in #700).

## Stacks

| Path | Stack |
|---|---|
| `frontend/` | web |
| `apps-script/` | apps-script |

**View library:** preact

The authoritative conventions for each component are in its stack skill:
`.claude/skills/stack-web/SKILL.md` and
`.claude/skills/stack-apps-script/SKILL.md`. Paths outside both, such as
`docs/` and this file, get the workspace rules and this file.

## Key commands

- `npm --prefix frontend run dev` — Vite dev server on port 5177, at
  `http://localhost:5177/` (the `forage` entry in the root `.claude/launch.json`)
- `cd frontend && npm run format` before committing (Prettier: single quotes,
  semicolons; CI runs `format:check`)
- `cd frontend && npm test` / `npm run typecheck` / `npm run build`
- `cd apps-script && npm test` / `npm run typecheck` — sandboxed `node:vm`
- A session never runs `clasp`; `apps-script/.clasp.json` is gitignored and
  `.clasp.json.example` is the template
- The user's terminal is PowerShell 5.1 — no `&&`; use `;` or separate commands
