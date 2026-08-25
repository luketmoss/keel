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
gh issue view <issue> --repo luketmoss/keel --json body,comments
```

The issue must be in **Refined**. If it's in To Do or PM Refining it hasn't been
through Gate 1 — stop and say so rather than refining it yourself on the way
past. The gate exists because the user wants to see the spec before it's built.

Read the comments, not just the body. A merge to the same Project since this
issue went to Refined can invalidate the premise it was written against — see
#203 — and `/ship` leaves a comment naming the merge when that risk exists.
Two outcomes:

- The merge it names doesn't touch what this issue depends on (a different
  change to the same project) — proceed, and say so briefly in the report.
- It does — **stop before cutting a branch.** Report what changed and what's
  now in question. Do not guess at whether the premise still holds; that
  guess is exactly what Gate 1 exists to avoid.

Read, in order: the issue body, the project's `CLAUDE.md`, its stack skill, the
**standing documents** under `<project>/docs/design/` — `CONVENTIONS.md` defines
which files those are, under the UX stage — and then the issue's own design note
if one exists.

The standing documents are not optional context. A note says what this issue
does; they say what everything looks like, and building to the note alone is how
a project ends up with two design languages.

## Start

```bash
python .keel/board.py set <issue> --status "In Development"
git fetch origin
git checkout -b <slug>/<issue>-<short-desc> origin/main
```

Branch names follow `CONVENTIONS.md`. The slug prefix is not optional — every
project shares one branch namespace.

Branch from `origin/main`, not local `main`. Local `main` can be ahead of
`origin/main` — unpushed work from an earlier session, say — and branching from
it pulls those commits into this PR's history silently.

## Build it

Work to the acceptance criteria and nothing else. The Out of Scope section is
there to be obeyed; if you find yourself wanting to exceed it, that's a new
issue, not a bigger diff.

Match the surrounding code — its naming, its comment density, its idioms. A
change that reads as foreign is a change that will be rewritten.

**Self-test before you claim completion.** Not "the code is written" — run it,
and confirm it does the thing.

Targeted: the tests covering what you changed, not the whole suite and not a
production build. `/test` runs the full suite minutes later and CI runs it
again, so a third pass here proves nothing the other two don't — and the
standard is unchanged, because "it compiles" was never the bar.

Where the stack can't be run locally, say exactly what you could and couldn't
verify.

If the issue turns out to be underspecified in a way that matters, stop, leave
the branch in place, and say what's missing. Do not invent the answer and bury
it.

## Exit

**Nothing under `docs/design/` may be uncommitted.** Before pushing:

```bash
git status --porcelain
```

If any line names a path inside a `docs/design/` directory — untracked or
modified — stop. Commit it, then push. `/ux` writes the note and this skill is
what puts it in the repository; #250 and #251 both reached Done with theirs
sitting in a working tree, and nothing downstream could see it, because a file
that was never added does not appear in a diff.

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
