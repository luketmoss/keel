---
name: stack-keel
description: Conventions, layout, and CI for keel itself - the conventions, the skills, and the board (Markdown, stdlib Python). Use when working outside a project folder, at the repository root.
---

# keel stack

The workspace working on itself. Authoritative for any issue whose `Project` is
`keel`.

**keel's project folder is the repository root.** There is no `keel/` directory
and there should not be one — splitting the skills from the conventions they
describe, for the sake of a naming symmetry, would put the two furthest apart
exactly where they must agree. The root `CLAUDE.md` is keel's project
`CLAUDE.md`; this file is its stack skill.

## What keel owns

| Path | What |
|---|---|
| `CONVENTIONS.md` | the rules — authoritative over every skill |
| `CLAUDE.md` | workspace rules, loaded in every session, and keel's own |
| `README.md` | the outside view |
| `.claude/skills/` | lifecycle and stack skills |
| `.keel/` | `board.json`, `board.py`, `check.py` |
| `.github/workflows/` | one per project, generated from stack skills |
| `docs/design/` | keel's UX artifacts, one file per issue |

Anything inside a `<project-slug>/` folder belongs to that project, not to keel.

## Testing

**Not human-gated.** `/test` runs `python .keel/check.py` and the delivery run
continues to Ready to Ship without stopping. Nothing here needs hardware, and
gating it would mean every issue about the pipeline halts inside the pipeline.

But the checks prove syntax, and most keel acceptance criteria are about
behaviour — what a skill does when it runs. Verify those in this order:

1. **Run it.** Anything read-only executes exactly as written: `board.py show`,
   `board.py list`, `board.py projects`, `gh issue view`, `gh pr view`. Compare
   the real output against the criterion.
2. **Trace it against a named case.** Where running would mutate the board, push
   a branch, or open a pull request, pick a concrete issue, walk the skill's
   steps against it, and record which branch of the skill that case takes. A
   criterion of the form *"the skill says what to do when X"* is satisfied by
   the text. A criterion of the form *"the skill does Y"* is not.
3. **Say you couldn't.** Per `/test`, a criterion you did not check is a
   failure, not a pass. Never quietly upgrade a trace into a pass.

**Never verify a skill by running it against live work.** The board is shared
state, and a lifecycle command run halfway leaves an issue in a stage nobody
moved it to — which is precisely the drift the board exists to prevent.

## Conventions

**Prose**

- `CONVENTIONS.md` wins. A skill that contradicts it is the bug, and the fix
  goes in the skill.
- Wrap at 80 columns. Every document here already does; a reflowed paragraph
  makes a one-word change look like a rewrite in the diff.
- Say what to do, then why — but only where the why prevents a plausible wrong
  turn. A skill is read by someone who will not re-derive the reasoning, and
  reasoning with nothing to prevent is padding.
- One `SKILL.md` per directory, with frontmatter carrying `name` — matching the
  directory exactly — and `description`. `check.py` enforces both.

**Python**

- Standard library only. No `pyproject.toml`, no `uv`, no test framework —
  `.keel/` is two scripts, and keeping them dependency-free is what keeps CI to
  a single step with nothing to install.
- Match `board.py`: a module docstring carrying the usage, `.format()` over
  f-strings, `# --- section ---` rules between groups of functions.
- Every board write goes through `board.py`, per the root `CLAUDE.md`. The
  hazard that makes it a rule is in `CONVENTIONS.md` §Board fields.

**Issues**

- Design notes go in `docs/design/<issue>-<slug>.md` at the root.
- Most keel work skips UX. A skill is read by Claude, not used by a person; when
  an issue does change something the user sees — a command's report, the
  README — it goes to UX like anything else.

## Checks

```bash
python .keel/check.py
```

Three things, all of which have a right answer that needs no judgment: `.keel/`
compiles, every skill's frontmatter parses and matches its directory, and every
relative link in a tracked `.md` file resolves. CI runs this and nothing else,
so a green run here is a green run there.

Adding a fourth check means adding a function to `CHECKS` in `check.py`. Do not
add one to the workflow — a check CI enforces that the local run doesn't is a
check that fails for the first time in a pull request.

## CI

keel's workflow, and the two deviations from `CONVENTIONS.md` that its folder
being the repository root forces, are in [scaffold.md](scaffold.md) beside this
file. There is no scaffold — keel is not created by `/new-project` — so that
file is the workflow alone.
