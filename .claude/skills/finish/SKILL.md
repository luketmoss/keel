---
name: finish
description: Run a refined Keel issue through the full delivery chain - development, testing, code review - stopping at Ready to Ship. Use when the user says to finish, build out, or deliver an issue.
---

# /finish

The delivery run. Takes an issue from Refined to Ready to Ship without stopping,
then hands to the user at Gate 2.

## Precondition

The issue must be in **Refined**. If it isn't, it hasn't been through Gate 1 —
stop and say so. Running the refinement chain and the delivery chain back to
back skips the only review of the spec, which is the point of having two runs.

## Sequence

1. **`/develop`** — branch, code, draft PR
2. **`/test`** — verify against acceptance criteria, take the PR out of draft
3. **`/review`** — review the diff, confirm the build
4. Stop. The issue is in **Ready to Ship**.

Each step is the real skill. Read and follow `.claude/skills/<step>/SKILL.md` at
each stage rather than approximating it.

**Do not run `/ship`.** The run ends at Gate 2. Merging is the user's call, and
this chain being unattended is only safe because it cannot reach main.

## Halting

The run stops early if:

- the issue is underspecified in a way that matters — `/develop` stops with the
  branch in place and says what's missing
- a criterion fails and the fix isn't clear or is out of scope
- the stack gates Testing — firmware always, mobile for device-dependent
  criteria. The run stops in Testing with the unverifiable criteria listed
- `/review` finds something blocking — the issue returns to In Development

Report where it stopped and why. Do not work around a gate.

## Report

When the run reaches Ready to Ship:

- issue and PR, with URLs
- what changed, in a few lines
- which acceptance criteria were verified and how
- anything `/review` noted that didn't block
- any judgment call that could reasonably have gone the other way

Then say plainly that nothing has merged and `/ship` is theirs to run.
