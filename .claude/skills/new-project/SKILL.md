---
name: new-project
description: Add a new project to the Keel workspace - folder, CLAUDE.md, board option, and CI workflow. Use when the user wants to start a new project, add a project to Keel, or scaffold a new app, tool, or firmware build.
---

# /new-project

Adds a project to the workspace. A project is a folder, a CLAUDE.md, a board
option, and a CI workflow — not a repo.

Read `CONVENTIONS.md` before starting. Work from the repo root
(`git rev-parse --show-toplevel`).

## 1. Interview

Ask with `AskUserQuestion`. Three things, one round — do not interrogate.

- **Slug** — lowercase, hyphenated. Becomes the folder, the branch prefix, the
  tag prefix, the workflow filename, and the board option. Propose one from what
  they've told you rather than asking cold.
- **Stack** — firmware, web, mobile, cli, or worker. Determines which stack
  skill is authoritative and what gets scaffolded. If the project has more than
  one component, ask instead for each component's path and stack (`frontend` →
  web, `api` → worker), per `CONVENTIONS.md` §Multi-component projects.
- **One-line purpose** — what it does and who for. Goes at the top of the
  project's CLAUDE.md.

If the user already stated any of these, don't re-ask.

Then confirm the slug is free: the folder must not exist and
`python .keel/board.py projects` must not already list it.

## 2. Load the stack skill

Read `.claude/skills/stack-<stack>/scaffold.md` for the scaffold and the CI
workflow, and `.claude/skills/stack-<stack>/SKILL.md` for whether Testing is
human-gated. For a web project, also pick the scaffold variant: `**View
library:**` is `preact` by default, or `react` when the user asks for it, and
the matching variant is the one transcribed. Do not invent any of that here. For
a multi-component project, do this for each component's stack.

Two files because only this skill needs the first one: every lifecycle command
reads `SKILL.md`, and the scaffold sat inside it being read on every issue and
acted on by none of them.

## 3. Create

In order:

1. `<slug>/` with the scaffold from `scaffold.md`. For a multi-component
   project, each component's scaffold goes under `<slug>/<path>` instead, and
   `<slug>/` itself holds only `CLAUDE.md` and `docs/`
2. `<slug>/CLAUDE.md` — see below
3. `<slug>/docs/design/.gitkeep`
4. `.github/workflows/<slug>.yml` from `scaffold.md`'s template, with the
   slug substituted into the path filter, concurrency group, cache keys, and
   `working-directory`. For a multi-component project, one job per component,
   named after its path, each built from that stack's scaffold with `<slug>`
   in its paths read as `<slug>/<path>` — working directory and cache paths
   included. The trigger filter, concurrency group and cache-key prefix stay the
   project's: `<slug>/**`, with no per-job filtering
5. `python .keel/board.py add-project <slug>`

Never edit the Project field by any other route — the append is destructive if
done wrong, which is the whole reason `board.py` exists.

## 4. Project CLAUDE.md

The file that tells every future session what this project is. Keep it short;
it is loaded on top of the root CLAUDE.md, not instead of it.

```markdown
# CLAUDE.md — <slug>

<one-line purpose>

**Stack:** <stack>. The authoritative conventions for this project are in
`.claude/skills/stack-<stack>/SKILL.md` — read it before writing code here.

Workspace rules live in the root `CLAUDE.md` and `CONVENTIONS.md`. This file
covers only what is specific to <slug>.

## Layout

<what lives where, once there is something to describe>

## Board

Project option: `<slug>`. Filter the board by it to see only this project's work.

## Testing

<from the stack skill — in particular, whether Testing is human-gated>
```

A multi-component project replaces the `**Stack:**` paragraph with a table, and
`## Testing` says which components are human-gated:

```markdown
## Stacks

Location, never inference: a file takes the stack of the longest path below
that contains it. Each stack's conventions are in
`.claude/skills/stack-<stack>/SKILL.md`. Paths no row contains have no stack
skill.

| Path | Stack |
|---|---|
| `<path>/` | <stack> |
```

A one-component project writes the `**Stack:**` paragraph above and nothing
here changes.

A web project, or a web component in a table, also records its view library with
a `**View library:** preact` (or `react`) line directly under `**Stack:**`, or
under the table. It must match the scaffold variant that was transcribed.

## 5. Commit and report

Commit as `Add <slug> project`. Then tell the user, briefly:

- what was created
- that the board now has a `<slug>` option
- that `/idea` is how they add the first piece of work

Do not create issues. A new project has no work in it until the user says what
they want built.
