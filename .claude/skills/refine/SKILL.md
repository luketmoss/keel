---
name: refine
description: Run a Keel issue through the full refinement chain - PM Refining, UX where applicable, stopping at Refined. Use when the user says to get an issue refined, or asks for a new idea to be created and refined in one go.
---

# /refine

The refinement run. Takes an issue from To Do to Refined without stopping, then
hands to the user at Gate 1.

## Sequence

1. **`/idea`** — only if the issue doesn't exist yet. "New idea for X and get it
   refined" starts here; "refine issue 42" does not.
2. **`/pm`** — always.
3. **`/ux`** — only if `/pm` routed the issue there. `/pm` owns that decision.
4. Stop. The issue is in **Refined**.

Each step is the real skill, not a summary of it. Read and follow
`.claude/skills/<step>/SKILL.md` at each stage rather than approximating what it
would have done.

## Halting

The run stops early, without advancing, if:

- `/pm` hits a question needing the user's judgment — the issue stays in PM
  Refining with `## Open Questions` filled in
- the issue sizes to XL — it stays in PM Refining with a proposed split
- the issue turns out not to describe a real problem — say so and propose
  closing it

**A halted run is a success.** Report where it stopped and why, and do not try
to work around the blocker.

## Report

When the run completes, give the user what they need to work Gate 1:

- issue number, title, URL
- the acceptance criteria, in full — this is what they're approving
- size, and the design note path if `/ux` ran
- anything you decided that could reasonably have gone the other way

That last point matters. The user is reviewing your judgment, not just your
output, and decisions buried silently in a spec are the ones that produce the
wrong thing three stages later.

Do not advance past Refined. The user runs `/finish` when they agree.
