---
name: develop
description: Implement a refined Keel issue - cut the branch, write the code, open a draft PR. Use when the user asks to build, implement, or start development on an issue.
---

# /develop

Implements an issue. Everything before this stage exists to make this stage
boring.

## Preconditions

```bash
python .keel/board.py show <issue>
```

The issue must be in **Refined**. If it's in To Do or PM Refining it hasn't been
through Gate 1 — stop and say so rather than refining it yourself on the way
past. The gate exists because the user wants to see the spec before it's built.

Read, in order: the issue body, the project's `CLAUDE.md`, its stack skill, and
the design note under `docs/design/` if one exists.

## Start

```bash
python .keel/board.py set <issue> --status "In Development"
git checkout main && git pull
git checkout -b <slug>/<issue>-<short-desc>
```

Branch names follow `CONVENTIONS.md`. The slug prefix is not optional — every
project shares one branch namespace.

## Build it

Work to the acceptance criteria and nothing else. The Out of Scope section is
there to be obeyed; if you find yourself wanting to exceed it, that's a new
issue, not a bigger diff.

Match the surrounding code — its naming, its comment density, its idioms. A
change that reads as foreign is a change that will be rewritten.

**Self-test before you claim completion.** Not "the code is written" — run it,
and confirm it does the thing. Where the stack can't be run locally, say exactly
what you could and couldn't verify.

If the issue turns out to be underspecified in a way that matters, stop, leave
the branch in place, and say what's missing. Do not invent the answer and bury
it.

## Exit

```bash
git push -u origin <branch>
gh pr create --draft --repo luketmoss/keel \
  --title "<issue title>" \
  --body "Closes #<issue>

<what changed and why, briefly>"
```

**Draft** — the PR exists from the moment there's code, but it isn't asking for
attention yet. `/test` takes it out of draft.

`Closes #<issue>` is what makes the merge close the issue. Without it the board
and the repo drift immediately.

Leave the issue in In Development. `/test` moves it on.
