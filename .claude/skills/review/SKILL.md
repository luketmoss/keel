---
name: review
description: Review a Keel PR against its acceptance criteria, post comments, verify CI, and move the issue to Ready to Ship. Use when the user asks to review an issue or its pull request.
---

# /review

Reviews the diff and confirms the build. Nothing reaches Ready to Ship — the
user's inbox — without passing through here.

## Start

```bash
python .keel/board.py set <issue> --status "Code Review"
gh pr view <pr> --repo luketmoss/keel --json number,title,statusCheckRollup,isDraft
```

Then the diff — **but only if you don't already have it**:

```bash
gh pr diff <pr> --repo luketmoss/keel
```

Standalone, handed a PR number by the user, you do: fetching it is the whole
start of the job. As `/finish`'s third step you wrote every line of it in this
session, and `gh pr diff` returns what you just typed.

## Verify the build

**This is the only thing standing between a red build and a PR that looks
ready.** Required status checks are deliberately off — a path-filtered required
check never reports and blocks its PR forever — so nothing else is watching.

**One PR can trigger several workflows** — a change under `cairn/` runs
`cairn` and `keel`, and a change to a shared folder runs every consumer. One
green run does not clear the PR; every run it had to pass must.

Run it:

```bash
python .keel/pr.py ci <pr>
```

It implements the rules below and prints the block this section ends with. Its
exit code is the verdict: **0** every expected run passed, **1** a run failed or
is absent (back to In Development), **2** the wait timed out with runs still in
progress (`--timeout SECONDS`, 900 by default). Do not read the workflow files
to work out what should have run; that is the script's job, from the base
branch's copies. It uses only REST, so it runs in a cloud session too; only
in one with no `gh` at all, do the same by hand with the GitHub MCP tools,
following the rules.

1. **List the runs for the head commit.** Take the head SHA from the PR, then
   its runs, cross-checked against `statusCheckRollup`. **Runs for earlier
   commits are ignored** — a green run on an old commit says nothing about
   this one, and neither does a run concurrency cancelled for a newer push.
   Where a workflow has more than one attempt for the head commit, read the
   latest. If a push lands during the review, the head moved: rebuild the list.
2. **Work out which workflows should have run.** One is expected when its
   `pull_request` trigger has no `paths` filter, or a filter that matches any
   file the PR changes — a rename counts at both its old and new path. Match
   by GitHub's glob rules: `*` does not cross `/`, `**` does. Push-only and
   scheduled workflows (`cairn-pages`) are not expected and are not listed.
3. **Wait for any run that is queued or in progress.** Do not report a result
   you don't have. If the wait outlasts your patience, report
   `Build — N runs still in progress on <sha>`, leave the issue in Code
   Review, and stop.
4. **Require `success` from every expected run.** Any other conclusion —
   `failure`, `cancelled`, `timed_out`, `action_required`, `skipped` — is not
   green. Quote each: the first failing step's first error line for a failure,
   otherwise the conclusion word (`action_required` adds that a run is waiting
   for approval). Back to In Development, with no diff review.

**An expected workflow with no run is not green.** An absent run and a passing
one look identical from the board, and with required status checks off nothing
else will notice. A run for the head commit may simply not be listed yet, so
re-query once after a short wait, as `/ship` does for `mergeable`; if it is
still missing, name the workflow, quote the `paths` entry that matches the PR's
changed file, say that another workflow's green run does not cover it, and stop.
The script re-queries once itself and prints all of this.
Either the filter doesn't reach the change or the workflow didn't start; both
are findings and both send the issue back to In Development.

If **nothing at all** ran, that is the same case with every workflow absent: at
least `keel` should have, since `keel.yml` runs on every PR.

**Report the list** (`pr.py ci` prints it), one line per expected run —
workflow name, then conclusion — under a heading that carries the commit:

```
Build — 2 runs on 9f3c2ab, all passed:
  cairn   success
  keel    success
```

With a failure the heading says `1 failed` and the line carries the quote; with
an absent run it reads `Build — no run for cairn on 9f3c2ab.` followed by the
reason above. Do not advance to Ready to Ship on a check that never reported.

## Review the diff

Read it against the acceptance criteria and the stack skill of every component
it touches. Look for:

- **The design note exists** — if the issue body has a `## Design` section,
  resolve the path it links and confirm the file is on the branch. A missing
  one blocks: the code cites reasoning the repository does not contain, and
  this is the only gate that can catch a note nothing in the source names.
  `check.py` catches the ones that are cited by filename; it cannot catch a
  note referred to only as `#NNN`, which is what #250 was.
- **Correctness** — does it do what the criteria say, in the cases the criteria
  describe and the ones they imply. When `/test` has just walked the criteria
  one at a time, don't walk them again — it verified them deliberately and,
  on an automated stack, proved each test can fail. Standalone, nothing has,
  and this is where that happens
- **Scope** — anything here that Out of Scope said wouldn't be
- **Fit** — does it read like the code around it, or like a transplant
- **Stack conventions** — the specific ones in the stack skill, which exist
  because they've bitten before

Post findings as PR comments, on the lines they concern. Be specific about what
breaks and when — a review comment that doesn't say what goes wrong is noise.

Distinguish what blocks from what doesn't. A naming preference is not a blocker;
a race condition is.

## If there are blocking findings

```bash
python .keel/board.py set <issue> --status "In Development"
```

Report them. Fixing them is `/develop`'s job, not this skill's — a reviewer who
rewrites the code hasn't reviewed it.

## Exit

Clean review, green build:

```bash
python .keel/board.py set <issue> --status "Ready to Ship"
```

Report what you found: issue, PR, what changed, what you checked, and anything
you noted that didn't block.

If the PR changes a human-reviewed path (`CONVENTIONS.md` §Human-reviewed
paths), add one line after the run list and before the findings. Name up to
three matching paths, then `and N more`:

```
Human-reviewed: this PR changes <path> and N more. It will not merge
unattended; /ship will ask first.
```

The outcome is unchanged — Ready to Ship. `pr.py ci` prints this line itself
when a changed path matches, so use its wording. In a cloud session, detect it
from the same changed-file list `/ship` does.

**Do not merge here.** `/ship` does that, and inside `/finish` it runs next —
which is exactly why this skill's build check is not a formality. Standalone,
the issue rests in Ready to Ship until someone runs `/ship`.
