---
name: pm
description: Refine a Keel issue into a specification - problem statement, acceptance criteria, scope, and size. Use when the user asks to refine, spec out, groom, or PM an issue.
---

# /pm

Turns an idea into something buildable. This is where the thinking happens; the
delivery run is only as good as what comes out of here.

Read `CONVENTIONS.md` for issue anatomy and the Definition of Ready.

## Start

```bash
python .keel/board.py show <issue>
python .keel/board.py set <issue> --status "PM Refining"
gh issue view <issue> --repo luketmoss/keel --json title,body,labels
```

Read the project's `CLAUDE.md` and its stack skill before specifying anything —
what's cheap and what's expensive is stack-dependent, and a spec written without
that knowledge will be wrong in ways that only surface during development.

## Do the work

Rewrite the body to the full issue anatomy.

**Problem** — what's actually wrong, and who it affects. Not the solution
restated as a complaint. If you can't articulate who is hurt by the current
state, that is a finding: say so.

**Proposal** — the intended approach, concretely enough to argue with. Name the
files or components involved where you know them.

**Acceptance Criteria** — the heart of it. Each one:
- observable behaviour, not implementation
- checkable by someone who didn't write the code
- specific enough to fail

"Works correctly" is not a criterion. "Valve closes within 5ms of the beam break
timestamp" is.

**Out of Scope** — what this deliberately doesn't cover. This is what stops the
delivery run from gold-plating, and it is worth real thought rather than a
token line.

**Size** — XS/S/M/L per `CONVENTIONS.md`. If it's XL, it isn't ready: say so,
propose the split, and leave the issue in PM Refining. Do not size optimistically
to get it moving.

## Stop rather than guess

If a question genuinely needs the user's judgment — a product decision, a
tradeoff with no obvious answer, an ambiguity that changes the shape of the work
— write it into the issue body under `## Open Questions` and **leave the issue in
PM Refining**. Say plainly that the run halted and why.

A halted run is a correct outcome. Guessing at a product decision and burying it
in acceptance criteria is not.

Routine judgment calls are yours to make. The bar is "would a different answer
lead to materially different work?"

## Exit

```bash
gh issue edit <issue> --repo luketmoss/keel --body-file <path>
python .keel/board.py set <issue> --size <XS|S|M|L> --status <next>
```

Next stage is **UX** if the issue has a user-facing surface — anything a person
sees, taps, or reads. Otherwise **Refined**: refactors, build tooling, firmware
timing, internal APIs.

Decide this yourself. Do not ask.
