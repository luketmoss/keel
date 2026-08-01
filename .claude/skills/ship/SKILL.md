---
name: ship
description: Merge a reviewed Keel PR, closing its issue and triggering the build. Use only when the user explicitly asks to ship, merge, or land an issue.
---

# /ship

Merges. **The only irreversible action in the system, and the only one the user
triggers by hand.**

## Never run this as part of a chain

`/finish` stops at Ready to Ship. If you arrived here from another skill rather
than from the user asking, stop — that is a bug in the calling skill, not a
judgment call to make.

Merging to main triggers the build, which means merged is deployed. The user
gets to decide that.

## Preconditions

```bash
python .keel/board.py show <issue>
gh pr view <pr> --repo luketmoss/keel --json number,isDraft,mergeable,statusCheckRollup
```

Refuse, and say why, if:

- the issue is not in **Ready to Ship** — it hasn't been reviewed
- the PR is still a draft
- checks are failing or pending
- the PR has conflicts

Don't work around any of these. Report and stop.

## Write the Results first

Before merging, fill in `## Results` on the issue body — what actually happened,
what surprised you, what you'd do differently. Draw on the whole run: what `/pm`
assumed, what `/test` found, what `/review` flagged.

This has to happen before the merge, because the merge closes the issue.

It is also the highest-value habit in the pipeline and the easiest to skip.
Months from now the Results section is the only part of the issue anyone reads.
Write something worth reading — "done" is not that.

## Merge

```bash
gh issue edit <issue> --repo luketmoss/keel --body-file <path>
gh pr merge <pr> --repo luketmoss/keel --squash --delete-branch
```

Squash — one issue, one commit on main. The branch is deleted; the shared branch
namespace fills up fast otherwise.

`Closes #<issue>` in the PR body closes the issue and moves the card to Done. If
the card doesn't move, the PR was missing that line — fix the board with
`board.py set <issue> --status Done` and mention it, since it means `/develop`
didn't do its job.

## Report

What merged, the commit on main, and that CI is building. If the project has a
deploy target, say where it's going.
