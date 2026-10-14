# #394 — `/review` checks every workflow run

What `/review` tells the user about the build. The behaviour is in the issue;
this note fixes the report's shape and what each outcome says. Nothing is
visual, so there are no tokens. The surface is text in the terminal or chat.

## The main path

1. `/review` finds the PR's head commit and lists every workflow run for it.
2. It works out which workflows should have run, from the PR's changed files and
   each workflow's `pull_request` trigger, and compares.
3. It waits for any run still queued or in progress.
4. All present and all `success`: the report lists them and the review goes on.

## Copy

**The run list**, in the report, one line per run, workflow name then
conclusion, in the order the workflows were listed. The heading carries the
commit:

```
Build — 2 runs on 9f3c2ab, all passed:
  cairn   success
  keel    success
```

Rules for the list:

- Only runs for the head commit appear. Earlier commits' runs are never listed.
- A workflow expected but not run is a line of its own, see below.
- A workflow that exists but is not expected for this PR (its `paths` filter does
  not match, or it triggers on push only, like `cairn-pages`) is **not** listed,
  so the list stays the answer to "what did this PR have to pass".
- The `paths` comparison is stated once, in the skill, not in each report.

**One run failed**, the others passed — the review stops there, no diff review:

```
Build — 2 runs on 9f3c2ab, 1 failed:
  keel    success
  cairn   failure   typecheck: src/Map.tsx(41,7): error TS2322 …
Back to In Development.
```

The quoted text is the first failing step's first error line, as the existing
skill already quotes a failure. More than one failing run: one line each.

**A run did not conclude `success` and did not fail** (`cancelled`, `timed_out`,
`action_required`, `skipped`): the conclusion word replaces `failure` in the
same line, and the review stops the same way. `action_required` adds
`(a workflow run is waiting for approval)`.

**An expected run is absent** (after one re-query):

```
Build — no run for cairn on 9f3c2ab.
cairn should have run: it triggers on changes under cairn/**, and this PR
changes cairn/src/Map.tsx. keel ran and passed, which does not cover it.
Back to In Development: the workflow's filter does not reach this change, or the
workflow did not start.
```

**Still running:** nothing is reported until every run has concluded. The wait
is not narrated run by run; if it exceeds the existing patience for a pending
check, the review reports `Build — N runs still in progress on <sha>` and stops
without advancing, leaving the issue in Code Review.

## States and edge cases

- **Zero runs and none expected.** Treated as the existing empty case: nothing
  ran, so nothing is green. A PR touching only files no workflow covers still
  triggers `keel`, so this arises only if `keel.yml` itself is broken.
- **A new push lands during the review.** The head commit changed; the list is
  rebuilt for the new commit before any conclusion is reported.
- **A re-run of a failed run succeeds.** The latest attempt for the head commit
  is the one read.
- **A run that concurrency cancelled because a newer commit arrived.** It belongs
  to an older commit and is ignored; the newer commit's run is the one read.
- **Cloud session, no `gh`.** The same list through the GitHub MCP tools; the
  report is identical.

## Decisions

- **Strict green.** Only `success` passes. `skipped` at the whole-run level is
  rare enough here that treating it as not-green costs a look; treating it as
  green could hide a workflow that never evaluated.
- **List only expected runs.** The report answers what the PR had to pass.
- **The failure quote is one line.** The full log is a click away on the run; a
  report that pastes it buries the verdict.
