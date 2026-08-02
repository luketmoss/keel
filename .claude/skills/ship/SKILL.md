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

`mergeable` often comes back `UNKNOWN` immediately after checks finish — GitHub
computes it asynchronously. That is not a conflict; wait a few seconds and
re-query rather than refusing on it.

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

`Closes #<issue>` in the PR body closes the issue. The card then moves to Done
by way of the board's *Item closed → Done* workflow — a second, separate
mechanism. When the card doesn't move, one line says which of the two failed:

```bash
gh issue view <issue> --repo luketmoss/keel --json state
```

**Still open** — the PR body was missing `Closes #<issue>`. Close the issue by
hand, set the card, and say so: this one really is `/develop` not doing its job.

**Closed, card didn't move** — nothing is wrong with the PR. Check whether
Project #6's *Item closed → Done* workflow is actually enabled before assuming
it:

```bash
gh api graphql -f query='query { user(login:"luketmoss") { projectV2(number:6) { workflows(first:30) { nodes { number name enabled } } } } }'
```

If the *Item closed* workflow is `enabled: false`, that's the cause. Ask the
user to turn it on at
`https://github.com/users/luketmoss/projects/6/workflows`; it is theirs to
click, and it fixes every future merge at once. If it's already `enabled:
true`, something else stranded the card — say so explicitly rather than
reaching for the same diagnosis anyway.

`board.py set <issue> --status Done` rescues a card already stranded. It is not
the remedy, and it isn't the first move — reach for it only after the check
above has run, so using it always means you looked. Reaching for it out of habit
after every merge is how a one-click board setting stays broken forever.

## Report

What merged, the commit on main, and that CI is building. If the project has a
deploy target, say where it's going.
