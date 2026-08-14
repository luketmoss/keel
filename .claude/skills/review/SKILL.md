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

Check `statusCheckRollup`. If the run failed, the issue goes back to In
Development with the failure quoted. If it's still pending, wait for it rather
than reporting a result you don't have.

**If it comes back empty, no check ran at all — treat that as not green.** An
absent run and a passing run look identical from the board, and with required
status checks off nothing else will notice. Name the workflow that should have
covered this change, compare the PR's files against its `paths` filter, and
stop. Either the project has no workflow or its filter doesn't reach the change;
both are findings, and both send the issue back to In Development. Do not
advance to Ready to Ship on a check that never reported.

## Review the diff

Read it against the acceptance criteria and the project's stack skill. Look for:

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

The issue is now at Gate 2. Tell the user what's waiting: issue, PR, what
changed, what you checked, and anything you noted that didn't block.

**Do not merge.** `/ship` is the user's to run.
