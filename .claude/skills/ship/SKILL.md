---
name: ship
description: Merge a reviewed Keel PR, closing its issue and triggering the build. Use only when the user explicitly asks to ship, merge, or land an issue.
---

# /ship

Merges. **The only irreversible action in the system.**

## Two ways in

`/finish` runs this as its fourth step, so the delivery run merges rather than
parking. Standalone is for the issues that *didn't* — the ones sitting in Ready
to Ship because a check was red, a PR had a conflict, or a review found
something — once whatever stopped them is fixed.

Merging to main triggers the build, which means merged is deployed and there is
no one else between here and `main`. The refusals below are what stands in for
the person who used to. None of them is a judgment call: every one is a fact
about the PR, and every one leaves the issue in Ready to Ship for a human rather
than proceeding.

## Preconditions

```bash
python .keel/board.py show <issue>
gh pr view <pr> --repo luketmoss/keel --json number,isDraft,mergeable,statusCheckRollup
```

Refuse, and say why, if:

- the issue is not in **Ready to Ship** — it hasn't been reviewed
- the PR is still a draft
- checks are failing, pending, or absent — a check that never ran is not a check
  that passed, and `/review` treats an empty rollup the same way
- the PR has conflicts

Don't work around any of these. Report and stop, leaving the issue in Ready to
Ship: inside `/finish` that is the run parking rather than merging, and the
column exists to be looked at.

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

## Flag Refined siblings

A merge can quietly invalidate the premise another Refined issue was written
against — see #203. After merging, check what else is waiting in the same
Project:

```bash
python .keel/board.py list --status Refined --project <project>
```

For each issue that comes back (excluding the one just shipped), post a
comment naming the PR that just merged and briefly describing what changed:

```bash
gh issue comment <other-issue> --repo luketmoss/keel --body "\
#<issue> just merged (<pr-url>): <one-line description of the change>.
If this issue's premise depends on the area that changed, re-check it
before starting development."
```

This runs after the merge and never blocks or changes its outcome — every
Refined issue in the Project gets flagged, not just ones that provably
overlap. `/develop` is what decides, per issue, whether a flag actually
matters.

## Report

What merged, the commit on main, and that CI is building. If the project has a
deploy target, say where it's going. Note any Refined siblings flagged in the
same Project.
