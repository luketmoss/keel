# #745 — Delivery runs deploy

What the user reads when `/ship` deploys an Apps Script API before merging, or
declines to, and what it says about the MCP Worker's deploy after the merge.
Terms follow `CONVENTIONS.md`. "Apps Script change" means the PR changes a file
under `<project>/apps-script/src/`.

Nothing here is visual, so there are no tokens. The surface is text in the
terminal or chat, and the issue's `## Results`.

## The main path

1. `/ship`'s preconditions and human-reviewed check pass, as today.
2. The PR has an Apps Script change. `/ship` checks it can deploy, records the
   live version, pushes, redeploys the existing deployment and confirms it.
   It prints nothing while it works except the commands' own output.
3. It writes `## Results`, with the `Deploy:` line below, then merges.
4. If the PR changed `mcp/**`, it reads the `mcp.yml` run on the merge commit
   and waits for its `deploy` job to finish (at most 10 minutes).
5. The report adds the deploy lines below to what `/ship` reports today.

A PR with no Apps Script change and no `mcp/**` change reads exactly as today.

## Copy

**`/ship` report, deploy section** — after "what merged" and the commit, before
the Refined siblings:

```
Deployed Forage's Apps Script before merging: version 58 on the live
deployment (was 57). Roll back with:
  clasp redeploy <deploymentId> -V 57
MCP Worker: deployed by mcp.yml (run <url>).
```

The deployment ID is printed in full in the rollback command, so it can be
copied. The project is named by its display name from its `CLAUDE.md`.

The MCP line has three forms:

```
MCP Worker: deployed by mcp.yml (run <url>).
MCP Worker: not deployed — mcp.yml skipped its deploy job (no
CLOUDFLARE_API_TOKEN). The merge is in.
MCP Worker: deploy FAILED in mcp.yml (run <url>). The merge is in and
nothing was reverted; the Worker still runs the previous version.
```

If the run has not finished after 10 minutes: `MCP Worker: mcp.yml still
running after 10 minutes (run <url>) — not confirmed.`

**`Deploy:` line in `## Results`** — the last line, as `stack-apps-script`
already requires:

```
Deploy: the session pushed and deployed version 58 on <deploymentId>
(previous 57; roll back with `clasp redeploy <deploymentId> -V 57`). Nothing
owed.
```

**Parked — cannot deploy.** Same shape as the human-reviewed park. Nothing ran,
nothing merged:

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

#795 reordered the steps, so a step that comes first is listed first, and
replaced the "comes first" reason below. Run on its own, `/ship` now asks the
owner to confirm those steps and deploys on a yes. When they are the only
reason, the park gives just those steps and says so. `/ship` §Deploy Apps
Script has the question and that report.

Reasons, one line each, every one that applies, in this order:

- `No clasp login in this session (cloud sessions never have one).`
- `forage/CLAUDE.md records no script ID or deployment ID.`
- `It adds the <scope> scope to appsscript.json, which needs
  re-authorization in the editor.`
- `The issue says <trigger / script property / migration> comes first.`
- `The PR's head commit <short sha> could not be fetched from origin.`
  (#811: the push is made from a worktree at that commit, so the shared
  checkout's state is not checked.)

The owner's steps list the project's own push command and the real deployment
ID when it is recorded; otherwise `<deploymentId>` stays as written. A step 3
appears only for the reasons that need one.

**Parked — the deploy failed part way.** The report says what is live, because
that is now different from `main`:

```
Parked in Ready to Ship — not merged.

Deploying Forage's Apps Script failed at <clasp push | clasp redeploy>:
  <the command's error, first 5 lines>

What is live now:
  pushed code: <the PR's | unchanged>
  deployment:  version 57 (unchanged)
Roll back the push with the PowerShell in
docs/design/811-deploy-from-worktree.md (a worktree at origin/main; #811
replaced the `git checkout` in the shared checkout that stood here)
```

When the push failed, `pushed code: unchanged` and the roll-back line is left
out.

**Parked — the merge failed after deploying.** `/ship` rolls back first, then
reports:

```
Parked in Ready to Ship — not merged.

The merge failed after Forage's Apps Script was deployed:
  <gh's error>
Rolled back: deployment is version 57 again, and origin/main's src is pushed.
```

If the roll back itself fails, the second paragraph is replaced with
`ROLL BACK FAILED — version 58 (this PR) is live and main does not have it.`
followed by the failing command's error and the two roll-back commands.

**`/finish` progress line** in a batch, for the new park:

```
#712 Parked in Ready to Ship — can't deploy Forage's Apps Script: no clasp login (sonnet)
```

The reason is the first reason line, without its full stop.

**`/review` finding** for an MCP safety-model change, in the PR comment and
the report, blocking:

```
Blocking: this PR <moves forage_delete_food onto the read connector | drops
forage_undo from the destructive-tools list | removes the confirm step from
<tool> | changes request authentication>, and no acceptance criterion asks
for it. MCP safety-model changes need an explicit criterion (CONVENTIONS.md
§Code Review).
```

## States and edge cases

- **Apps Script change only in tests or `package.json`.** Not an Apps Script
  change; no deploy, no deploy lines.
- **Two Apps Script projects in one PR.** Each deploys in path order, each
  gets its own `Deploy:` line and report paragraph. A park on either parks the
  whole PR; one already deployed is rolled back first.
- **Another session switches the shared checkout mid-deploy.** Not noticed and
  not relevant since #811: the push comes from a worktree at the PR's head
  commit, and the live source is pulled back and compared before the merge.
- **`/ship` re-run after a deploy-failure park.** Starts over: records the
  live version again, pushes and redeploys again. Nothing from the first run
  is remembered.
- **Several PRs in one `/ship` request.** Each deploys immediately before its
  own merge, never all first.
- **The live deployment is already at a version newer than `main` expects**
  (someone deployed by hand). Not detected; the session deploys over it and
  the report's "was" version is the evidence.
- **Human-reviewed and Apps Script both.** The human-reviewed question comes
  first; a no ends the run before anything deploys.

## Decisions

- **Deploy in `/ship`, not `/develop` or `/test`.** `/ship` is already the one
  irreversible step and the one that refuses. A push from `/test` would change
  what live triggers run before review.
- **Deploy before the merge, not after.** The merge deploys the Worker, which
  calls the new API; the API has to be live first. The cost is a window where
  live has code `main` doesn't, which the merge-failure roll back closes.
- **A failed Worker deploy is not reverted.** The API is backward compatible by
  rule (columns appended, never moved), so the old Worker against the new API
  is a known-safe state. A revert is a new PR, for a person.
- **Every park names the owner's steps.** A park that only says "can't" sends
  the owner to three files to find out what to type.
