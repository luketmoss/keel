# #811 — Deploy from a worktree at the PR head

What the user reads when `/ship` deploys an Apps Script change, now that the
push comes from a detached worktree pinned at the PR's head commit and not from
the shared checkout. Terms follow `CONVENTIONS.md`. It amends
[745-delivery-deploys.md](745-delivery-deploys.md); where the two differ, this
note wins.

Nothing here is visual, so there are no tokens. The surface is the terminal and
the issue's `## Results`.

## The main path

Unchanged to the reader, apart from one added step. `/ship` checks it can
deploy, creates the worktree, records the live version, pushes and redeploys
from the worktree, pulls the live source into a scratch folder and compares it
with the PR's `src`, then removes the worktree and scratch folder and merges.
It prints nothing while it works except the commands' own output. A clean
shared checkout, a dirty one and one on another branch all deploy the same.

## Copy

**Park reasons.** The reason `The checkout is not at the PR's head, or
apps-script/src has uncommitted changes.` is deleted: the state of the shared
checkout no longer matters. In its place, in the same position (last):

```
The PR's head commit <short sha> could not be fetched from origin.
```

**Parked — the live source does not match the PR.** A new failed-part-way
report, for a `clasp pull` that differs from the PR's `src`. Nothing merged:

```
Parked in Ready to Ship — not merged.

Deploying Thrive's Apps Script pushed, but the live source is not the PR's:
  <up to 5 differing files, one per line>

What is live now:
  pushed code: not verified as the PR's
  deployment:  version 49 (new) — it may not carry this PR
Roll back with: clasp redeploy <deploymentId> -V 48
```

The roll back is the real deployment ID and previous version. The `Deploy:`
line in `## Results` is not written, and the issue is not merged.

**Roll-back commands in the reports.** Where a report gives the owner a
roll-back that re-pushes `main`'s source, it now gives it from a detached
worktree, in PowerShell, not `git checkout` in the shared checkout:

```powershell
git worktree add --detach "$env:TEMP\keel-rollback" origin/main
Set-Location "$env:TEMP\keel-rollback\thrive\apps-script"
clasp push --force
Set-Location D:\Projects\code\keel
git worktree remove --force "$env:TEMP\keel-rollback"
```

The project's own push command and its own path stand in for `clasp push
--force` and `thrive/apps-script` where they differ.

## States and edge cases

- **Another session switches the shared checkout mid-deploy.** Not noticed and
  not relevant: nothing reads the checkout after the worktree is created.
- **A worktree left by an interrupted run.** `/ship` removes a leftover at its
  own path, and prunes, before creating one.
- **Two Apps Script projects in one PR.** Each deploys from its own worktree
  path, in path order, as before.
- **Verification differs only by line endings or manifest key order.** Not a
  mismatch: text files compare with line endings normalised and
  `appsscript.json` compares as parsed JSON.
- **The verifying pull fails.** The same park as a mismatch, naming the
  command's first 5 error lines in place of the file list.
- **Cleanup fails.** Reported as a note after the `Deploy:` line; it never
  parks or reverses a deploy.

## Decisions

- **Write `.clasp.json` from the recorded script ID, never copy it.** The
  shared checkout's copy is whatever the last session left, and the recorded ID
  is the one the project's `CLAUDE.md` says is live.
- **Fetch the PR head by its commit, not by branch name.** A branch can move
  between the check and the push; a commit cannot.
- **Verify the pushed source, not the version.** `clasp pull` returns the
  script's current files, which is what the push just wrote; a version's
  source cannot be read back with `clasp`, and the redeploy is confirmed
  separately by `clasp list-deployments`.
