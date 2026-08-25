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

Each step is the real skill. Read and follow `.claude/skills/<step>/SKILL.md` at
each stage rather than approximating it.

**Step 4 is `/ship` itself, not a merge written out again here.** `/review`
leaves the issue in Ready to Ship, which is the state `/ship` already requires,
so it runs against exactly what it expects — with its refusal conditions, its
Results section and its board-workflow diagnosis intact. The only irreversible
operation in the system is written down once.

## Halting

The run stops early if:

- the issue is underspecified in a way that matters — `/develop` stops with the
  branch in place and says what's missing
- a merge to the same Project since Refined invalidated this issue's premise
  (#203) — `/develop` stops before cutting a branch and says what changed
- a criterion fails and the fix isn't clear or is out of scope
- the stack gates Testing — firmware always, mobile for device-dependent
  criteria. The run stops in Testing with the unverifiable criteria listed
- `/review` finds something blocking — the issue returns to In Development
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
