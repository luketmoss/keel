# #393 — Human review for `mcp/` and token changes

What the user reads when a PR touches a human-reviewed path: three reports and
one question. Everything else about the change is in the issue. Terms here
follow `CONVENTIONS.md`; "matching paths" are the changed files that fall under
its Human-reviewed paths subsection.

Nothing here is visual, so there are no tokens. The surface is text in the
terminal or chat.

## The main path

1. `/review` finishes clean and moves the issue to Ready to Ship, as always. If
   the PR has matching paths, its report carries one extra line (below).
2. In a delivery run, `/ship` checks the changed-file list **first** — before
   it reads `## Results`, before it writes it, before any merge command. On a
   match it stops. The issue stays in Ready to Ship.
3. `/finish` ends with the parked report.
4. Later, the user reads the diff and runs `/ship <issue>`. `/ship` names the
   matching paths and asks. A yes merges through the normal path, Results first.

## Copy

Paths are listed one per line, repo-relative, at most five; beyond that the
sixth line is `and N more`. Order is the order in the changed-file list.

**`/review` report, one added line** (after the run list, before the findings):

```
Human-reviewed: this PR changes mcp/src/thrive/tools.js and 2 more. It will
not merge unattended; /ship will ask first.
```

With three or fewer matching paths they are all named; with more, the first
three and `and N more`.

**`/finish` report when parked** (replaces the merge section of the report):

```
Parked in Ready to Ship — not merged.

PR #412 changes human-reviewed paths:
  mcp/src/thrive/tools.js
  mcp/src/thrive/api.js
  mcp/test/thrive-tools.test.js

Everything else passed: <what /finish normally reports>.
Review the diff, then run /ship 410 to merge.
```

**`/ship` refusal inside `/finish`** is the same first two paragraphs; `/finish`
adds the rest.

**`/ship` run on its own**, before anything else:

```
PR #412 (Add undo to thrive_update_workout) changes human-reviewed paths:
  mcp/src/thrive/tools.js
  mcp/src/thrive/api.js
These are not merged without your say-so. Merge it now? (yes / no)
```

- **Yes** — continues exactly as `/ship` does today: preconditions, Results,
  merge.
- **No**, or anything that is not a yes: `Not merged. #410 stays in Ready to
  Ship.` No retry, no second prompt.

## States and edge cases

- **Several PRs, one `/ship` request.** A request to ship everything in Ready to
  Ship asks once per matching PR, in order, and merges the unmatched ones with no
  question. A "yes" answers only the PR the question named.
- **No way to ask.** An unattended or non-interactive session treats the
  question as unanswered: not merged, same message as a no.
- **Only part of the PR matches.** The whole PR is gated. The report lists only
  the matching paths, so the reason is visible; it does not suggest splitting.
- **A path is renamed out of `mcp/`.** The old path is in the changed-file list
  and matches; it is listed like any other.
- **A matching path is only deleted.** Still a match.
- **The token stylesheet does not exist yet.** Only `mcp/**` can match until
  #386 creates it. Nothing is said about the absent file.
- **The PR changes `CONVENTIONS.md`'s list itself.** Not special. The list that
  applies is the one on the PR's base branch, so a PR cannot un-gate itself.
- **The user's yes was for an earlier run.** Not honoured. Each `/ship`
  invocation asks afresh.
- **The same PR re-run after a push.** The refusal repeats; nothing about a
  previous park is stored.

## Decisions

- **The question lives in `/ship`, not `/review`.** `/review` has to stay
  repeatable and non-blocking — it runs unattended inside `/finish`. `/ship` is
  already the only irreversible step, and already the one that refuses.
- **A bare `/ship` is not consent.** The user types `/ship 410` for many
  reasons, including having just fixed a parked issue; the human review is the
  reading of the diff, which only the question can ask for.
- **No per-path explanation.** The user chose the list; repeating why `mcp/` is
  special in every report is noise. The reason appears once, in
  `CONVENTIONS.md`.
