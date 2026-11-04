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
no one else between here and `main`. An Apps Script API is the exception CI
cannot deploy, so this skill deploys it itself, just before the merge. The
refusals below are what stands in for the person who used to. None of them is a
judgment call: every one is a fact about the PR, and every one leaves the issue
in Ready to Ship for a human rather than proceeding.

## Preconditions

```bash
python .keel/board.py show <issue>
gh pr view <pr> --repo luketmoss/keel --json number,isDraft,mergeable,statusCheckRollup
```

Refuse, and say why, if:

- the issue is not in **Ready to Ship** — it hasn't been reviewed
- the PR is still a draft
- checks are failing, pending, or absent — a check that never ran is not a check
  that passed, and `/review` treats an empty rollup the same way. Run
  `python .keel/pr.py ci <pr>` for this: exit 0 clears it, anything else is the
  refusal, and its output is the reason. (With no `gh` at all: read
  `statusCheckRollup` from the PR instead.)
- the PR has conflicts

Don't work around any of these. Report and stop, leaving the issue in Ready to
Ship: inside `/finish` that is the run parking rather than merging, and the
column exists to be looked at.

`mergeable` often comes back `UNKNOWN` immediately after checks finish — GitHub
computes it asynchronously. That is not a conflict; wait a few seconds and
re-query rather than refusing on it.

## Human-reviewed paths

After the preconditions pass and **before `## Results` is read or written and
before any merge command**, list the PR's changed files:

```bash
gh pr diff <pr> --repo luketmoss/keel --name-only
```

(In a cloud session, the GitHub MCP equivalent.) Compare them to
`CONVENTIONS.md` §Human-reviewed paths, using the list on the PR's base branch.
A rename counts at both paths. Any match gates the whole PR.

On a match, list the matching paths one per line in changed-file order, at most
five, then `and N more`.

- **Inside `/finish`:** do not merge. Leave the issue in Ready to Ship and stop
  with:

  ```
  Parked in Ready to Ship — not merged.

  PR #<pr> changes human-reviewed paths:
    <path>
  ```

- **On its own:** ask, naming the PR, and wait for the reply:

  ```
  PR #<pr> (<title>) changes human-reviewed paths:
    <path>
  These are not merged without your say-so. Merge it now? (yes / no)
  ```

  A yes, in reply to that question, continues with Results and the merge. A no,
  anything that is not a yes, or a session with no way to ask, ends with `Not
  merged. #<issue> stays in Ready to Ship.` — no retry, no second prompt. The
  yes covers that PR in this invocation only; a bare `/ship` is not consent and
  nothing is remembered. Shipping several PRs asks once per matching PR and
  merges the unmatched ones without a question.

## Deploy Apps Script

After the human-reviewed check passes and **before `## Results` is written**,
look at the same changed-file list for a file under
`<project>/apps-script/src/`. Tests, `package.json` and the rest of
`apps-script/` are not an Apps Script change: no deploy, no deploy lines. With
no Apps Script change, skip to Results.

**This is the only place any skill runs `clasp`.** `/develop`, `/test` and
`/review` never do: a push alone changes what live triggers run, before review.
Deploying here, before the merge, is what keeps the order every project asks
for — the API is live before the merge deploys the Worker that calls it.

Name the project by its display name from its `CLAUDE.md` (Forage, Thrive,
Hive). Two Apps Script projects in one PR deploy in path order, each with its
own `Deploy:` line and report paragraph; a park on either parks the whole PR,
and one already deployed is rolled back first (step 5). Shipping several PRs,
each deploys immediately before its own merge, never all first.

### 1. Check it can deploy

Every one of these, or park (below). Check them all without running `clasp`
first, and park on any failure without running it at all; only when every one
passes does `clasp show-authorized-user` confirm the account:

- **A clasp login.** `~/.clasprc.json` exists — reading for the file runs
  nothing. A cloud session (`CLAUDE_CODE_REMOTE=true`) never has one. Once the
  rest pass, `clasp show-authorized-user` must name the project's deploying
  account, where its `CLAUDE.md` names one, since the web app executes as
  whoever deploys it.
- **The IDs are recorded.** The project's `CLAUDE.md` deploy section records
  the script ID and the live web-app deployment ID.
- **No new scope.** `appsscript.json` adds nothing to `oauthScopes` against
  the base branch. A new scope always parks: re-authorization comes after the
  push, so there is nothing to confirm beforehand.

  ```bash
  git diff origin/main -- <project>/apps-script/src/appsscript.json
  ```
- **The owner's steps are done.** The issue names no trigger to install,
  script property to set, or migration or backfill to run — or it does, and
  the owner has confirmed them (below).
- **The PR's head commit can be fetched.** `gh pr view <pr> --json
  headRefOid` names it, and `git fetch origin <headRefOid>` brings it local.
  The push is made from that commit (step 3), so what the shared checkout has
  checked out, or has uncommitted, does not matter and is not read.

**Confirming the owner's steps (#795).** The issue's text is all this check can
read, and a re-run starts over, so a step the owner has already done would
park every run. The confirmation follows the human-reviewed rule:

- **Inside `/finish`:** no question. The check fails and the run parks.
- **On its own:** once every other check passes, so the answer is the last
  thing standing between the session and the push, ask and wait for the reply:

  ```
  PR #<pr> (<title>) needs these done before Thrive's Apps Script is deployed:
    <step, as the issue names it>
  Have you done them? (yes / no)
  ```

  One step per line, in the issue's order. A yes, in reply to that question,
  passes the check, and the deploy goes on to step 2. A no, anything that is
  not a yes, or a session with no way to ask, parks. The yes covers that PR in
  this invocation only; a bare `/ship` is not consent and nothing is
  remembered. A step the issue places after the deploy (installing a trigger
  that runs the new code, say) is listed with `(after the deploy)` and is not
  part of the yes: it goes in the `Deploy:` line as owed.

### 2. Record the live version

```bash
cd <project>/apps-script
clasp list-deployments
```

Note the version the live deployment ID serves. It is the "was" in the report
and the `-V` of every roll back.

### 3. Push and redeploy, from a worktree

**Never push from the shared checkout (#811).** Other sessions share it and
switch its branch, so a check that it is at the PR is true only when read: on
4 Nov 2026 a push sent main's code in place of #773's. Push from a detached
worktree at the PR's head commit instead. Remove and prune any leftover at the
path first, then create it:

```bash
wt=<temp>/keel-ship-<issue>-<project>
git worktree remove --force "$wt"; git worktree prune
git worktree add --detach "$wt" <headRefOid>
cd "$wt/<project>/apps-script"
```

Write `.clasp.json` there from the recorded script ID, in the form
`.clasp.json.example` gives. Never copy it from the shared checkout. Then run
the project's push command and redeploy the existing deployment, all from the
worktree:

```bash
clasp push              # or `clasp push --force` where the project says so
clasp redeploy <deploymentId> --description "#<issue> <title>"
```

**Never `clasp deploy` or `clasp create-deployment`.** Either makes a new
deployment with a new URL, and every consumer holding the old one — the
Worker's secret, the Pages bundles — breaks.

A failure here parks with the failed-part-way report below, after step 6's
clean-up.

### 4. Confirm

`clasp list-deployments` again: the live deployment ID now serves a version
newer than the one recorded in step 2. If it doesn't, that is a failed
redeploy — park with the failed-part-way report.

### 5. Verify the live source is the PR's

Before anything merges, pull the script's live files into a scratch folder and
compare them with the PR's `src` at `<headRefOid>`:

```bash
scratch=<temp>/keel-ship-<issue>-<project>-pull
rm -rf "$scratch"; mkdir -p "$scratch"
cp "$wt/<project>/apps-script/.clasp.json" "$scratch/"
cd "$scratch" && clasp pull
git diff --no-index --ignore-cr-at-eol --stat \
  "$wt/<project>/apps-script/src" "$scratch/src"
```

Text files compare with line endings normalised and `appsscript.json` as
parsed JSON, so formatting alone is not a difference. Any other difference, or
a failed `clasp pull`, parks with the source-mismatch report below. Do not
write `## Results` or merge. Verifying the pushed files is the most `clasp`
can show: it cannot read a version's source, and step 4 confirms the version.

### 6. Clean up, then Results and the merge

Remove the worktree and the scratch folder on every path out of step 3
onward, the parks included:

```bash
git worktree remove --force "$wt"; rm -rf "$scratch"; git worktree prune
```

A clean-up failure is a note after the `Deploy:` line. It never parks or
reverses a deploy.

Write `## Results` with the `Deploy:` line below, then merge as the next
sections say. **If the merge fails after a deploy, roll back** before
reporting, from a second detached worktree at `origin/main` and never by
`git checkout` in the shared checkout:

```bash
clasp redeploy <deploymentId> -V <previous>
git worktree add --detach "$wt" origin/main
cd "$wt/<project>/apps-script"     # with .clasp.json written as in step 3
clasp push              # the project's push command: triggers run main's
git worktree remove --force "$wt"
```

Then park with the merge-failed report.

### The `Deploy:` line

The last line of `## Results`, as `stack-apps-script` requires. When this
session deployed:

```
Deploy: the session pushed and deployed version 58 on <deploymentId>
(previous 57; roll back with `clasp redeploy <deploymentId> -V 57`). Nothing
owed.
```

`Nothing owed.` becomes the steps still owed to the owner, when there are any.
After a confirmation, the line names what the owner confirmed:

```
Deploy: the owner confirmed in chat that they had run the migration
(migrate-765-spin.mjs) and set SPIN_API_KEY; the session then pushed and
deployed version 58 on <deploymentId> (previous 57; roll back with
`clasp redeploy <deploymentId> -V 57`). Nothing owed.
```

### Parked — cannot deploy

Same shape as the human-reviewed park. Nothing ran, nothing merged, and the
issue stays in Ready to Ship:

```
Parked in Ready to Ship — not merged, nothing deployed.

PR #<pr> changes Forage's Apps Script, and this session can't deploy it:
  <reason>

The owner's steps, in order:
  1. <property, migration or backfill step the issue says comes first>
  2. clasp push --force
  3. clasp redeploy <deploymentId> --description "#<issue> <title>"
  4. <re-authorization or trigger step>
Then run /ship <issue> to merge.
```

Reasons, one line each, every one that applies, in this order:

- `No clasp login in this session (cloud sessions never have one).`
- `The clasp login is <account>, not <deploying account>, which
  thrive/CLAUDE.md names.`
- `forage/CLAUDE.md records no script ID or deployment ID.`
- `It adds the <scope> scope to appsscript.json, which needs
  re-authorization in the editor.`
- `The issue names owner steps for the deploy, and inside /finish there is
  no one to confirm them.` — or, run on its own, `The owner's steps were not
  confirmed.`
- `The PR's head commit <short sha> could not be fetched from origin.`

The owner's steps use the project's own push command and the real deployment
ID when it is recorded; otherwise `<deploymentId>` stays as written. Steps 1
and 4 appear only for the reasons that need them, numbered from 1:
re-authorization is `stack-apps-script` §Deploying step 3, and a trigger the
issue places after the deploy goes at 4.

**When the owner's steps are the only reason,** the session could deploy, so
the report gives the steps without the clasp commands and ends differently:

```
Parked in Ready to Ship — not merged, nothing deployed.

PR #<pr> changes Thrive's Apps Script, and this session can't deploy it:
  The issue names owner steps for the deploy, and inside /finish there is
  no one to confirm them.

The owner's steps, in order:
  1. <property, migration or backfill step>
Then run /ship <issue> on its own. It asks you to confirm these are done,
then deploys and merges.
```

### Parked — the deploy failed part way

What is live now differs from `main`, so the report says what it is:

```
Parked in Ready to Ship — not merged.

Deploying Forage's Apps Script failed at <clasp push | clasp redeploy>:
  <the command's error, first 5 lines>

What is live now:
  pushed code: <the PR's | unchanged>
  deployment:  version 57 (unchanged)
Roll back the push with the PowerShell below
```

```powershell
git worktree add --detach "$env:TEMP\keel-rollback" origin/main
Set-Location "$env:TEMP\keel-rollback\forage\apps-script"
clasp push --force
Set-Location D:\Projects\code\keel
git worktree remove --force "$env:TEMP\keel-rollback"
```

The project's own push command and path stand in where they differ; the
worktree is at `origin/main`, never the shared checkout. When the push failed,
`pushed code: unchanged` and the roll-back are left out.

### Parked — the live source is not the PR's

Step 5 found the pushed source differs from the PR's, or could not pull it.
Nothing merged, and no `Deploy:` line is written:

```
Parked in Ready to Ship — not merged.

Deploying Thrive's Apps Script pushed, but the live source is not the PR's:
  <up to 5 differing files, one per line | the pull's first 5 error lines>

What is live now:
  pushed code: not verified as the PR's
  deployment:  version 49 (new) — it may not carry this PR
Roll back with: clasp redeploy <deploymentId> -V 48
```

The roll-back is the real deployment ID and the version from step 2. Add the
PowerShell above where the pushed code also needs rolling back.

### Parked — the merge failed after deploying

```
Parked in Ready to Ship — not merged.

The merge failed after Forage's Apps Script was deployed:
  <gh's error>
Rolled back: deployment is version 57 again, and origin/main's src is pushed.
```

If the roll back itself fails, the second paragraph is replaced with
`ROLL BACK FAILED — version 58 (this PR) is live and main does not have it.`
followed by the failing command's error and the two roll-back commands.

A re-run of `/ship` after any of these parks starts over: it records the live
version again and pushes and redeploys again. Nothing from the first run is
remembered.

## Write the Results first

Before merging, fill in `## Results` on the issue body — what actually happened,
what surprised you, what you'd do differently. Draw on the whole run: what `/pm`
assumed, what `/test` found, what `/review` flagged.

This has to happen before the merge, because the merge closes the issue.

It is also the highest-value habit in the pipeline and the easiest to skip.
Months from now the Results section is the only part of the issue anyone reads.
Write something worth reading — "done" is not that.

A PR with an Apps Script change ends `## Results` with the `Deploy:` line from
§Deploy Apps Script.

If `/test` listed criteria as **waived by the owner, not verified** (android,
mobile), `## Results` lists them under "Watch after install", worded as
unverified, and says where the build to install comes from: the APK from the
merge's CI run on `main` (android), an EAS build of the merged `main` commit
(mobile).

If `/test` listed criteria that need the deployed Apps Script as **not verified
here**, `## Results` lists them under "Check after deploy", worded as
unverified, after the `Deploy:` line, each with how the owner proves it from
`stack-apps-script` §Testing. When `/ship` parked, they are checked once the
owner has finished the steps and the script is deployed.

Write the text to a file, then let the script put it in the body:

```bash
python .keel/pr.py results <issue> <file>
```

It replaces an existing `## Results` section, or appends one, and leaves every
other section of the body byte for byte as it was. With no `gh` at all, edit the
body through the GitHub MCP tools and keep the other sections the same way.

## Merge

```bash
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

## The MCP Worker's deploy

When the PR changed anything under `mcp/`, the merge is what deploys the
Worker: `mcp.yml`'s `deploy` job runs on the push to `main`. Find that run on
the merge commit and wait for it, **at most 10 minutes**:

```bash
gh run list --repo luketmoss/keel --workflow mcp.yml --commit <merge-sha> \
  --json databaseId,status,conclusion,url
gh run view <run-id> --repo luketmoss/keel --json jobs
```

Report its `deploy` job in exactly one of these forms:

```
MCP Worker: deployed by mcp.yml (run <url>).
MCP Worker: not deployed — mcp.yml skipped its deploy job (no
CLOUDFLARE_API_TOKEN). The merge is in.
MCP Worker: deploy FAILED in mcp.yml (run <url>). The merge is in and
nothing was reverted; the Worker still runs the previous version.
MCP Worker: mcp.yml still running after 10 minutes (run <url>) — not
confirmed.
```

A failed Worker deploy is reported, not reverted. The API is backward
compatible by rule — columns appended, never moved — so the previous Worker
against the new API is a known-safe state, and a revert is a new PR for a
person.

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

## Clean up worktrees

After the merge and the sibling flags, run:

```bash
python .keel/worktrees.py clean --apply
```

It removes worktrees under `.claude/worktrees/` whose PR has merged and that
have nothing uncommitted, with their local branches, and prints why it kept the
rest. It always exits 0, and a `warn:` line in its output is reported in one
line. Like the sibling flags, it never blocks or changes the ship's outcome.

## Report

What merged, the commit on main, and that CI is building. If the project has a
deploy target, say where it's going.

Then the deploy section, after the commit and before the Refined siblings —
only for what this PR touched. A PR with no Apps Script change and no `mcp/`
change reads as above, with no deploy lines:

```
Deployed Forage's Apps Script before merging: version 58 on the live
deployment (was 57). Roll back with:
  clasp redeploy <deploymentId> -V 57
MCP Worker: deployed by mcp.yml (run <url>).
```

The deployment ID is printed in full in the rollback command, so it can be
copied. The MCP line is one of the four forms in §The MCP Worker's deploy.

Note any Refined siblings flagged in the same Project.
