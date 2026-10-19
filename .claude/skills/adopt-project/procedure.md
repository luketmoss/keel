# Adopting a project: the procedure

What each child issue of an `/adopt-project` epic does, and the failures each
step guards against. Read by the children's delivery runs, not by
`/adopt-project` itself, which only plans and files. Every step ends with a
**Rollback** line; if a step has none that works, say so in the issue before
doing it.

The five safety rules in [SKILL.md](SKILL.md) bind every child. Throughout,
`<old>` is the old repo, `<slug>` the project, and **[old repo]** marks the only
steps allowed to touch the frozen repo.

## Before anything

- Work from a local clone of `<old>` and keep it. Update it once, at the start
  (`git fetch`, then fast-forward), record its `HEAD` as the **source SHA**, and
  never pull it again. Everything below reads that clone, not the remote.
- Confirm `main` in Keel is current: `git fetch origin` and branch from
  `origin/main`. A local `main` that is behind is how an old poller gets pushed.

## 1. Import

**Read the old workflows from the local clone before filtering.** `git
filter-repo` drops `.github/`, so the originals are not in the filtered history
and cannot be recovered from it. Copy them aside first; the deploy, syncs and CI
issues transcribe from the copy.

Filter a fresh clone, never the working one:

1. `git clone <old> work && cd work`
2. `git filter-repo --to-subdirectory-filter <slug>/<component>` for each
   component's paths, dropping what does not move: `.github/`, `.claude/`,
   local settings, and anything the old repo committed by accident.
3. Rewrite issue references in commit messages (below).
4. **Check the imported history** before it goes near Keel: a log of the
   filtered history for `*service-account*.json`, `*-sa.json`, `.clasp.json`,
   `.env*` and token files must be empty, and a search of its content for key
   and secret patterns must be clean. History is permanent once merged, so
   anything found here is dropped in the filter, not later.

**The `#N` rewrite.** Bare `#N` in an imported commit message points at the old
repo's issues; in Keel it would point at Keel's. Rewrite it to `<old>#N`:

- the pattern is `#` followed by 1-4 digits, **not preceded** by a letter, a
  digit, `/` or `_`, and **not followed** by a word character, so `#1a2b3c`
  survives
- references already qualified (`owner/name#N`) are untouched
- apply it to commit messages only, never file content

Then **review by hand** what the pattern cannot judge: ranges (`#263-#266`,
where the second end needs the first's prefix), board references (`Project #4`
is a board, not an issue), and cross-app references (another app's `#N`, which
the pattern gives the old repo's name wrongly). Fix each by hand, not by
loosening the pattern.

**Project files.** `<slug>/CLAUDE.md` pins the stack (or a `## Stacks` table),
and has a **History** section saying where the code came from and, in plain
present tense, what runs where. `.gitattributes` pins LF (`* text=auto eol=lf`)
so Windows checkouts do not fail format checks. `.gitignore` covers
credentials, local env files and build output. A project with Apps Script has
`.clasp.json.example` committed and `.clasp.json` ignored. The CI workflow is
generated from the stack skill's `scaffold.md`.

**Rebuild the import rather than merging `main` into it.** If `main` moves while
the import is open, do not merge it in: that adds a second merge commit and
tangles the history. Redo the merge of the filtered history onto the new `main`
and cherry-pick the follow-up commits (project files, CI) on top.

**Record the source SHA in the merge commit's message:** `Import <slug> from
<old>@<sha>`.

**Merge with a merge commit, never squash.** A squash flattens the import into
one commit. The import issue carries its own acceptance criterion requiring a
merge commit, so its delivery run parks in Ready to Ship rather than
`/ship`ping it. The user, or the orchestrating session, runs `gh pr merge
--merge`. Do not change `/ship` to do it.

**Reviewing a big PR.** `gh pr diff` refuses a PR over 300 files. Review, and
the human-reviewed-paths check in `CONVENTIONS.md`, with `git diff --name-only
origin/main...HEAD` instead.

**Rollback:** nothing deploys. Close the PR and delete the branch; before the
merge there is nothing to undo. After it, `git revert -m 1 <merge>`.

## 2. Deploy

The new copy is served beside the old one; the old URL is not touched.

- **Confirm the secrets and variables exist before this issue runs.** Read the
  names from the old workflows (kept from step 1) and check with `gh secret
  list` and `gh variable list`. An unset variable makes the first acceptance
  criterion fail, and the person who sets it is the user: identifiers and
  credentials are named, never requested in chat.
- The build takes its base path from `VITE_BASE_PATH`, so it serves at
  `/keel/<slug>/` here and at `/` without the variable.
- The manifest's `start_url` and `scope` are relative (`./`), or the installed
  app opens at the wrong path.
- `<slug>-pages.yml` publishes the frontend to `gh-pages/<slug>`. It shares the
  one `gh-pages` concurrency group with every other app's pages workflow, with
  `cancel-in-progress: false`, so two deploys queue instead of cancelling.
  It has `workflow_dispatch`, so the first deploy does not need a code change.
- **Check that the other apps under the same Pages site still serve** after the
  deploy: fetch each one's URL and expect 200.
- The user opens the new URL and signs in; the old URL is unchanged.

**Rollback:** delete `gh-pages/<slug>` on the `gh-pages` branch, and the
workflow.
The old URL never moved.

## 3. Identity (only when colour or icon is not in the registry)

Add the project's row to the registry in `ui/` and its icon, per the `ui/`
rules. Affects only the new copy. If the row already exists, there is no issue.

**Rollback:** revert the row.

## 4. Syncs and the flip (only when the interview found any)

Two copies of a sync that refresh the same rotating token invalidate each
other. So the code lands first, **dark**, and the flip is one deliberate run.

**Landing dark.** Transcribe each sync and watchdog workflow from the old
clones, changing only names, paths, group names, secret references, and one
gate: each sync job has `if: vars.<SLUG>_SYNCS_LIVE == 'true'`, with the
variable unset. Watchdogs are ungated. Diff each against its original; cron,
inputs, timeouts and permissions are identical. A poller that dispatches
workflows is changed to dispatch into Keel, merged, and **not deployed**. Set
the new secrets by copying existing values; run no authorize script, and never touch
a rotating-token file. Ungated watchdogs fail until their secrets exist, so the
user sets those first.

**The flip, in the order Thrive ran it.** In a fresh session, with about half a
usage window left, early in a day the user is around:

1. **[old repo]** Disable the old sync and watchdog workflows (`gh workflow
   disable <name> --repo <old>`). A secret that cannot be copied (the user holds
   no local copy) is renewed now and not before, so the old copy never goes
   stale while it is still running.
2. Set the off switch: `gh variable set <SLUG>_SYNCS_LIVE --body true`.
3. Make sure the dispatch token covers **both repos** (`<old>` and Keel) for the
   poller, so storing it earlier does not break the live poller. Start from a
   **fresh `origin/main`**, then diff Keel's `src` against the frozen checkout:
   the only difference should be the dispatch target. Only then does the owner
   run `clasp push` and deploy a new version of the existing web-app deployment
   (the URL does not change). A session never runs these.
4. **Hand-dispatch each sync once** with `workflow_dispatch` and check its log
   row, then use the app's sync button and confirm the request ends done.

Then wait, which costs no usage. The tail holds **24 hours of green
watchdogs**, one unattended run of each sync, and one run after a token
refresh. Remember scheduled runs on a new workflow can arrive every 4 to 6
hours rather than every 3: dispatch the check by hand rather than count runs.

**Rollback**, any time before the cutover: set the variable false or unset it,
**[old repo]** re-enable the old workflows, and redeploy the previous Apps
Script version. Safe as long as the two copies never ran at once.

## 5. Cutover

Starts with about half a usage window left, and, with a flip, only once the
syncs have run clean under it.

- The user verifies the new copy on the phone and reinstalls the installed app
  from the new address. If anyone else uses it, they are told first.
- **[old repo] the redirect PR.** Fill [redirect.html](redirect.html) in for the
  project: `{{NAME}}` is the display name, `{{OLD_PATH}}` the path segment under
  the old Pages site, `{{NEW_URL}}` the full new URL ending in `/`. Change the
  old repo's Pages workflow to publish it as both `index.html` and `404.html`.
  **Test it on real URLs before merge:** the path, a query and a hash must all
  carry over, `location.replace` must keep the old URL out of history, and the
  no-slash form (`/<old-path>`) must land too. Merge it only on the user's
  say-so.
- **Transfer the old repo's open issues** to Keel (`gh issue transfer`).
  Transferring renumbers them. Sub-issue links follow; check them. Set board
  status, project, priority and size on the new board from the old one, since
  a transfer does not carry them.
- **Search the files** for the old issue numbers (design notes cite them) and
  point each at the new number. Issue bodies that cite `<old>#N` still resolve
  through GitHub's redirect and are left alone.
- Re-point any scheduled task that works in the old checkout, and copy its
  local settings across.
- **Rewrite the project `CLAUDE.md` History section to what is true now.** It
  must be true at each stage: no sentence says the old repo builds, deploys or
  runs something it no longer does, and none says Keel runs what it does not
  yet. Stale text here told sessions the syncs still ran from the old repo after
  they had moved.
- **Close the old board.** The tail, not this issue, archives the repo.

Split the time-based checks and the archive into the tail so this issue closes
and the in-progress slot frees.

**Rollback:** revert the redirect PR in `<old>` (the old site returns); the
transferred issues can be transferred back.

## 6. Tail

Depends on the cutover. Holds what waits on time or on the user, so nothing
holds the in-progress slot for days:

- the first scheduled run from the new location (a brief, a sync), checked
- the 24 hours of green watchdogs, when there is a flip
- **[old repo] the archive**, last, on the user's yes. It is irreversible in
  effect, so it states what it archives and waits for a clear yes in chat. After
  archiving, check that the old URL still redirects.

**Rollback:** an archived repo can be unarchived by the owner.

## Lessons, as rules

| Failure | Rule |
|---|---|
| `filter-repo` dropped `.github/` | Copy the workflows from the clone before filtering |
| `main` moved mid-import | Rebuild the import, never merge `main` into it |
| The rewrite hit "Hive (#263-#266)" and "Project #4" | Review ranges, boards and cross-app references by hand |
| `gh pr diff` refused 300+ files | Use `git diff --name-only` |
| A repo variable was unset at the first criterion | Check variables and secrets before the deploy runs |
| Local `main` was behind | Branch and push only from a fresh `origin/main` |
| `/ship` squashes | The import merges by hand with `--merge` |
| `CLAUDE.md` said the old repo still ran things | Re-read History at every stage |
| A transfer renumbers issues | Search files for old numbers after it |
| The tail held the slot for a day | Split the tail from the cutover |
