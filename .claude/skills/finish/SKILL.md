---
name: finish
description: Run a refined Keel issue through the full delivery chain - development, testing, code review, merge. Use when the user says to finish, build out, ship, or deliver an issue.
---

# /finish

The delivery run. Takes an issue from Refined to Done without stopping.

## Precondition

The issue must be in **Refined**. If it isn't, it hasn't been through Gate 1 —
stop and say so. Running the refinement chain and the delivery chain back to
back skips the only review of the spec, which is the point of having two runs.

## Sequence

1. **`/develop`** — branch, code, draft PR
2. **`/test`** — verify against acceptance criteria, take the PR out of draft
3. **`/review`** — review the diff, confirm the build
4. **`/ship`** — Results, merge, delete the branch

When a step is handed to a subagent or a new session, pick its model from
[CONVENTIONS.md](../../../CONVENTIONS.md#models) and name the row in the report.

Each step is the real skill. Read and follow `.claude/skills/<step>/SKILL.md` at
each stage rather than approximating it.

**Step 4 is `/ship` itself, not a merge written out again here.** `/review`
leaves the issue in Ready to Ship, which is the state `/ship` already requires,
so it runs against exactly what it expects — with its refusal conditions, its
Results section and its board-workflow diagnosis intact. The only irreversible
operation in the system is written down once.

## Several issues

Applies when `/finish` is given an epic, a list of issues, or both. A single
issue runs the sequence above, unchanged. A batch is that sequence once per
issue, each in a fresh context: run in one session, per-turn context grows with
every issue's CSS, test output and diffs (#505). The wording of the plan,
progress lines and report is in
[docs/design/508-batch-finish.md](../../../docs/design/508-batch-finish.md).

1. **Resolve the list.** Expand each epic into its open sub-issues, in
   sub-issue order (`gh api repos/luketmoss/keel/issues/<n>/sub_issues`). A
   child with sub-issues of its own is expanded where it sits, so #449 inside
   #440 is replaced by its children and is not delivered itself. An issue named
   twice is delivered once, at its first position. Any issue not in **Refined**
   is listed as skipped with its stage, and is never refined on the way past —
   Gate 1 applies to each one. Print the plan line before starting. If nothing
   is left, print `Nothing to deliver` and start no subagent.
2. **One subagent per issue, one at a time,** each running single-issue
   `/finish <n>` in the main checkout, with no worktree. Take its model from
   [CONVENTIONS.md](../../../CONVENTIONS.md#models). Its prompt holds the issue
   number, "follow `.claude/skills/finish/SKILL.md`", the Report section above
   as the format to end with, and "run plain, single-purpose commands".
   Nothing about the code goes in it: the subagent starts cold from the issue,
   as a gate requires.
3. **Keep only the reports.** The orchestrator reads no code, diffs or test
   output. Print a progress line as each issue ends, and start the next only
   after the previous one is Done.
4. **Halting.** An issue that does not reach Done stops the batch, and the rest
   stay in Refined. The one exception is a halt on a failing criterion whose
   fix wasn't clear: re-run that issue once on Opus, per §Models, and stop the
   batch only if that fails too. Gate halts — human-gated Testing,
   human-reviewed paths, `/ship` refusals, an underspecified issue — are never
   retried. A subagent that returns no usable report is a halt with the reason
   `subagent ended without a report`, never retried; read the issue's stage
   with `python .keel/board.py show <n>` for its row.
5. **Close epics.** When every sub-issue of an epic named in the request is
   closed, write the epic's `## Results` — one line per child with its PR, and
   anything the batch learned — and close it. An epic with unfinished children
   stays open and is listed as such.
6. **Report** as the design note specifies, built from the subagents' reports.

A batch is sequential, across projects as well as within one; start separate
batches per project for the same effect. A stopped batch is not resumed
automatically: run `/finish` again with what's left.

## Halting

The run stops early if:

- the issue is underspecified in a way that matters — `/develop` stops with the
  branch in place and says what's missing
- a merge to the same Project since Refined invalidated this issue's premise
  (#203) — `/develop` stops before cutting a branch and says what changed
- a criterion fails and the fix isn't clear or is out of scope
- the stack gates Testing — firmware always, mobile and android for
  device-dependent criteria. The run stops in Testing with the unverifiable criteria listed
- `/review` finds something blocking — the issue returns to In Development
- the PR changes a human-reviewed path (`CONVENTIONS.md` §Human-reviewed
  paths). `/review` ends clean and `/ship` declines to merge; the issue stays
  in Ready to Ship
- `/ship` refuses — a draft PR, checks failing or absent, a conflict. The issue
  **stays in Ready to Ship**, which is what that column now means: not a queue
  of things to rubber-stamp, but the ones that could not finish on their own

Report where it stopped and why. Do not work around a gate.

## Report

When the run merges:

- issue and PR, with URLs, and the commit on `main`
- what changed, in a few lines
- which acceptance criteria were verified and how
- anything `/review` noted that didn't block
- any judgment call that could reasonably have gone the other way

When it stopped instead, say where and why, and that nothing merged.

When it parked on a human-reviewed path, the report opens:

```
Parked in Ready to Ship — not merged.

PR #<pr> changes human-reviewed paths:
  <path>
```

One matching path per line, at most five, then `and N more`. Follow with
everything else the run would normally report, then
`Review the diff, then run /ship <issue> to merge.`
