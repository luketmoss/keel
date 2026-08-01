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
gh pr diff <pr> --repo luketmoss/keel
```

## Verify the build

**This is the only thing standing between a red build and a PR that looks
ready.** Required status checks are deliberately off — a path-filtered required
check never reports and blocks its PR forever — so nothing else is watching.

Check `statusCheckRollup`. If the run failed, the issue goes back to In
Development with the failure quoted. If it's still pending, wait for it rather
than reporting a result you don't have.

## Review the diff

Read it against the acceptance criteria and the project's stack skill. Look for:

- **Correctness** — does it do what the criteria say, in the cases the criteria
  describe and the ones they imply
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
