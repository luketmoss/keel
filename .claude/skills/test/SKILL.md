---
name: test
description: Verify a Keel issue against its acceptance criteria and take its PR out of draft. Use when the user asks to test, verify, or validate an issue or its implementation.
---

# /test

Verifies the work against the acceptance criteria, one at a time, deliberately.

## Start

```bash
python .keel/board.py set <issue> --status "Testing"
gh issue view <issue> --repo luketmoss/keel --json body
```

Read the project's stack skill first. **It declares whether Testing is
human-gated for this stack**, and that changes how this skill ends.

## Verify

Take the acceptance criteria in order. For each one, establish whether it passes
and record how you know. Run the tests, run the thing, read the output.

Three outcomes per criterion:

- **Passes** — with the evidence. "Test `valve_timing` passes" or "ran it, valve
  closed 3ms after the edge"
- **Fails** — the issue goes back to In Development. Not forward with a caveat
- **Cannot be verified here** — physical hardware, a real device, a visual
  judgment. Name it explicitly; never let it pass silently

A criterion you didn't actually check is a failure, not a pass. Do not infer
from a green build that behaviour is correct — a compile proves syntax.

When a criterion's evidence is an automated test, a green run proves the test
passes, not that it would fail if the behavior it claims to cover broke. Before
recording that criterion as passing, confirm the test can fail: briefly break
the behavior, run the test, confirm it fails, then restore the behavior. A test
that renders a component and asserts something trivially true is exactly as
green as a real one — the only way to tell them apart is to watch it fail.

## If anything fails

```bash
python .keel/board.py set <issue> --status "In Development"
```

Report what failed and why. Fix it if the fix is clear and within scope, then
re-run this skill from the top. Don't accumulate half-verified criteria.

## Exit

**If the stack skill declares Testing human-gated** (firmware always; mobile for
device-dependent criteria): verify everything verifiable, then **stop**. List
the criteria that need hardware or a device, in full, and hand back. Do not
advance, and do not take the PR out of draft — it isn't ready for review while
its behaviour is unconfirmed.

**Otherwise**, when every criterion passes:

```bash
gh pr ready <pr-number> --repo luketmoss/keel
python .keel/board.py set <issue> --status "Code Review"
```

Taking the PR out of draft is the signal that it wants eyes.
