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

Read the stack skill of every component the issue touches first. **Each
declares whether Testing is human-gated for its stack**, and that changes how
this skill ends. In a multi-component project the gate is per touched component:
an issue touching a gated one is gated for the criteria that component owns.

## Verify

Take the acceptance criteria in order. For each one, establish whether it passes
and record how you know. Run the tests, run the thing, read the output.

**The full suite and the build are yours.** `/develop` self-tests with targeted
runs only, so this is the first place everything runs together, and nothing
reaches Code Review without it.

Three outcomes per criterion:

- **Passes** — with the evidence. "Test `valve_timing` passes" or "ran it, valve
  closed 3ms after the edge"
- **Fails** — the issue goes back to In Development. Not forward with a caveat
- **Cannot be verified here** — physical hardware, a real device, a visual
  judgment. Name it explicitly; never let it pass silently

**Never run `clasp`** to verify an Apps Script change — not even a push. A push
changes what the live triggers run before review; `/ship` deploys it, just
before the merge (`stack-apps-script` §Deploying). What needs the live script
is listed back as not verified here, as that stack skill says.

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

**If a touched component's stack skill declares Testing human-gated** (firmware
always): verify everything verifiable, then **stop**. List the criteria that
need hardware, in full, and hand back. Do not advance, and do not take the PR
out of draft — it isn't ready for review while its behaviour is unconfirmed.

**If the stack skill says the owner waived the device check** (android,
mobile): verify everything verifiable, then list the device-dependent criteria
back as **waived by the owner, not verified**, in full and by number. They are
not passes and must not be worded as passes. Then continue as below; the list
is what `/ship` carries into `## Results` as things to watch after install.

**If the issue touches Apps Script** and a criterion needs the deployed script
(`stack-apps-script` §Testing): verify everything the sandbox can, then list
those criteria back as **not verified here**, in full and by number. They are
not passes and must not be worded as passes, and they are not a halt: nothing
deploys before `/ship`. Continue as below; `/ship` carries them into
`## Results` as things to check after the deploy.

**Otherwise**, when every criterion passes (or is waived or listed back, above):

```bash
gh pr ready <pr-number> --repo luketmoss/keel
python .keel/board.py set <issue> --status "Code Review"
```

Taking the PR out of draft is the signal that it wants eyes.
