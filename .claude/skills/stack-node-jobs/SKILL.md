---
name: stack-node-jobs
description: Conventions, scaffold, and CI for scheduled Node jobs in Keel (Node ESM, GitHub Actions schedules, node --test). Use when working in a project folder whose CLAUDE.md names node-jobs as its stack.
---

# Node jobs stack

Unattended jobs that run on a GitHub Actions schedule, written in Node, with no
model in the loop. Authoritative for any component a project's `## Stacks`
table names `node-jobs`. It is built from Thrive's `sync/`, its README and its
four sync and watchdog workflows, which state the rules below at length; where
this file and that README disagree about a Thrive detail, the README is right
about Thrive and this file is the bug.

These jobs break the pipeline's usual assumptions in one way: **a broken job
fails silently, several times a day.** A green CI run proves almost nothing
about whether the schedule fires, the secrets are present, or a rotated token
survives into the next run. Everything below is there to make a failure loud,
and Testing says what no session can see — see Testing is partly human-gated.

## Layout

```
<component>/
├── package.json
├── package-lock.json
├── README.md             # credentials, setup, and "When a run fails"
├── run.mjs               # the scheduled entry
├── deadman.mjs           # the watchdog's entry
├── authorize.mjs         # one-time sign-in, run by the owner (if the job has one)
├── src/                  # the logic, one concern a file
└── test/
    ├── *.test.mjs
    ├── helpers.mjs       # the shared fakes
    └── fixtures/         # a vendor's real responses, committed
```

- **ESM Node.** `"type": "module"`, `.mjs` files, and `engines` pinned
  (`"node": ">=20"`). CI and the workflows use the same major version.
- **Entry scripts are thin.** `run.mjs` and `deadman.mjs` parse arguments, call
  a function in `src/` and set the exit code. The logic is in `src/` so a test
  can call it with fakes, without spawning a process.
- **Authorize scripts run locally, by the owner, never by the schedule.** A
  one-time sign-in needs a browser and a person (`authorize.mjs`,
  `google-authorize.mjs`, `withings-authorize.mjs` in Thrive). They live beside
  the entry scripts, write the first token to the store, and appear in no
  workflow.
- **Hand-run migration tooling is not this stack.** A one-off script that edits
  data once — Thrive's `scripts/` — pins no stack skill (`—` in the `## Stacks`
  table), and nothing here applies to it.
- **No dependency the job can avoid.** The watchdog imports only files in the
  repository, so its workflow needs no `npm ci` and cannot be broken by one.

## Testing

```bash
npm test    # node --test
```

`node --test`, with fakes for every external service: the vendor, the token
store, the run record. **No network and no secrets**, so CI runs the suite
unfiltered and a pull request from anywhere can run it. A test that needs a
secret or a connection is a test that cannot run in the pull request that most
needs it.

- **Fakes live in `test/helpers.mjs`** and share the real object's contract
  (`load`/`save`, `append`/`latest`), so a test cannot pass against a fake that
  behaves differently from the thing it replaces.
- **Real responses are fixtures.** Once the job has called a vendor, save what
  it answered under `test/fixtures/` and feed that to the parser. The parser is
  strict: a field it uses with a shape it does not know fails that item, and a
  field it does not use is ignored.
- **Inject the clock and the environment.** A function takes `now` and `env`
  rather than reading `Date` and `process.env`, which is what makes the schedule
  and the secrets testable at all.

## Scheduling

One workflow per job, `.github/workflows/<slug>-<job>.yml` (`CONVENTIONS.md`
§Continuous integration). Each point has a reason that prevents a plausible
wrong turn.

- **One `cron` expression.** A second line double-runs on a DST changeover day.
  DST drift is accepted, not corrected: the schedule is in UTC, and an hour's
  shift twice a year is cheaper than the second line.
- **An odd minute.** The top of the hour is where GitHub delays or drops
  scheduled runs. `:23` and `:41`, never `:00`. Two workflows never share a
  minute.
- **`workflow_dispatch` is always present.** It is how the owner proves the job
  and re-runs it after a fix. A job that rotates a token also offers a
  `force_refresh` boolean input, which is how a rotated token is proved to
  survive (Testing is partly human-gated).
- **`timeout-minutes`**, set to what a run needs with room, so a hung run ends
  rather than holding the group.
- **`permissions: contents: read`.** The job reads the repository to check it
  out and writes nowhere in it.
- **A concurrency group named for the job**, `<slug>-<job>`. A job that rotates
  a token or writes non-idempotently **queues and never cancels**:
  `cancel-in-progress: false`, because a cancelled run could die between
  refresh and persist and lose the grant. GitHub keeps at most one *pending* run
  per group, so a newer one cancels an older pending one. That run never
  started and writes no record, so **the run window must cover a dropped run**:
  each run re-reads far enough back to pick up what the dropped one would have.
  A watchdog that only reads may use `cancel-in-progress: true` in its own
  group, and must not join the job's.
- **A schedule runs from the default branch only.** A workflow does nothing until
  it merges, and `workflow_dispatch` cannot start it from a branch that has not.
  The first real run follows the merge, which is why that run is the owner's to
  watch.

## Secrets and logs

Actions secrets are repo-wide: every workflow can read every secret
(`CONVENTIONS.md`). The workflow's `env:` block is the only boundary, so it names
the secrets the job reads and no others, and a job with a credential another
job does not need says so in its README's credentials table.

**The repository is public, and so are its Actions logs.** Therefore:

- **Summary-only log mode by default.** The workflow sets `JOB_LOG=summary`. The
  log then carries counts, dates, the status, the run id and error class names,
  and nothing the vendor sent. Unset, a local run logs everything, which is how
  the owner debugs.
- **A redaction module.** `src/redact.mjs` replaces every registered secret
  wherever it appears and masks any field or parameter named like a credential
  whatever its value. A token is registered the moment it is first read, and
  everything that reaches a log or a record goes through `redact()`. Anything
  that downloads without credentials, such as a signed URL, is a secret too.
- **Errors are reported by class.** In summary mode an abort prints
  `Aborted by <ErrorName>` and the run id, and a row in the README's "When a
  run fails" table is looked up by that class. The message, which may quote the
  vendor, is in the run record only.

## The run record

**Every run writes one row to a durable log, last, whatever happened.** The row
is the only account of a run that survives it, and the only thing the watchdog
can read.

| Field | Holds |
|---|---|
| `run_id` | `<event>-<run id>-<attempt>` in Actions (`schedule-…`, `workflow_dispatch-…`), else `local-<started_at>`. The prefix tells an unattended run from one a person started |
| `started_at`, `finished_at` | ISO instants |
| counts | what the job processed: seen, created, updated |
| `n_errors`, `status`, `error_detail` | `ok`, `partial` or `failed`, and the redacted detail led by the error class |
| `notes` | what the run noted that is not a failure |

- **`ok`** is exit 0. **`partial`** is a run that completed with failures, exit
  1. **`failed`** is a run that aborted, exit 1, with `error_detail` led by the
  class: `GrantDeadError: …`. **The exit code agrees with the row**: 0 only for
  `ok` with the row written.
- **A row that cannot be written fails the run**, even when the work was clean.
  A run with no record is a run nobody can see.
- **Missing record secrets cost the record, never the work.** The run does its
  work, then fails naming them.
- **A re-sent `run_id` is not appended twice.** The store enforces it, so a
  retried append is safe.
- **The log is somewhere a run's end does not erase**: a sheet, a database, a
  file in storage the job rewrites. A file in the runner's workspace is gone
  when the run is.
- **A tab or table per job.** Two jobs that share a record let one hide the
  other stopping, because the watchdog reads the newest row of any job in it.

## Watchdog and dead-man's switch

A job that does not run cannot report itself. The watchdog is a **separate
workflow**, `<slug>-<job>-watchdog.yml`, on its own schedule, that fails — and
so sends Actions' failure email — when the newest run record, of any status, is
older than a threshold. It asks whether the job ran, not whether it succeeded: a
failed run already sends its own email.

**The threshold rule.** The longest time between two runs that the job may
legitimately go through is one dropped run, so:

> threshold = the largest sum of two consecutive gaps in the schedule, plus an
> hour of scheduler delay, rounded up to a whole hour

A stopped job is then reported within the threshold plus the watchdog's own
interval. One dropped run never alarms, and two always do.

Worked for the scaffold's schedule, `23 1,7,13,19 * * *`: the runs are 6 hours
apart, so the gaps are 6, 6, 6 and 6. Dropping one run leaves 12 hours, and the
hour of delay makes **13**. A watchdog every 3 hours reports a stopped job
within 13 + 3 = 16 hours. Thrive's COROS sync, `17 9,13,18,0 * * *`, has gaps
of 9, 4, 5 and 6; the worst dropped run is the one between the 6 and the 9, so
15 + 1 = **16**.

- **Its own offset schedule**, at a minute clear of the job's, every few hours.
  It fails on every run once tripped, until the job records one.
- **It reads the record and nothing else**, and `--now` and `--threshold-hours`
  prove it trips without touching real data.
- **An empty or unreadable record trips it too.** If the watchdog cannot read
  the record the job cannot write it, so the job is probably failing as well.
- **What it cannot see.** It lives on the same scheduler as the job, so it
  cannot catch **GitHub's scheduler stopping for the whole repository**, which
  includes the auto-disable of scheduled workflows after 60 days without
  activity on a public repository: that stops the watchdog too. Something
  outside the repository has to notice, such as a "last synced" line the app
  shows its owner. It also cannot catch a job that runs, records `ok` and does
  nothing useful — an empty result is a run — so a job whose silence would be
  the failure counts what it processed and says so in the record's `notes`.

## Token rotation

A vendor that rotates its refresh token on every use breaks a workflow's usual
approach: **a workflow cannot rewrite its own secrets**, so a token that rotates
lives in a store the job rewrites — a file in the owner's storage, never an
Actions secret. A token that does not rotate is an Actions secret as usual. The
README's credentials table says which is which.

The rules, once, in `src/rotate.mjs`:

1. **Refresh only near expiry.** A run refreshes when the access token has less
   than a set margin left, not on every run. A vendor with long-lived access
   tokens rotates about monthly; one with short-lived tokens rotates nearly
   every run, and the margin is accordingly small.
2. **Persist the new token before using it.** The old refresh token is spent the
   moment the vendor answers, so the new one exists only in memory until it is
   saved. If the save fails the run stops, unused, with a `PersistError`.
3. **Re-read once on `invalid_grant` before giving up.** A refusal usually means
   another process rotated first. Re-read the store and retry once, but only if
   it now holds a *different* refresh token; the same one would be refused the
   same way. Then it is a dead grant, and only a person can fix it.
4. **Never two refreshes at once.** This one is the workflow's, not the code's:
   its concurrency group queues and never cancels, which keeps two runs apart
   and keeps a cancelled run from dying between refresh and persist.

Register every token with the redaction module as it is read, including the one
just rotated in.

## Testing is partly human-gated

`/test` runs the suite and verifies what it can. Fakes verify the **logic**. They
cannot verify anything that only a real run produces, so those acceptance
criteria are listed back as **cannot be verified here**, and the run stops in
Testing rather than claiming them — the same shape as firmware. If all of an
issue's criteria are covered by fakes, the run continues to Ready to Ship.

What `/test` cannot verify, and how the owner proves each:

| Category | The owner proves it by |
|---|---|
| The schedule fires | Waiting for the first scheduled run after the merge: Actions shows a run with the `schedule` event, and the run record has a row whose `run_id` begins `schedule-`. Several days of such rows are the evidence. A schedule runs from the default branch only, so no pull request can show it |
| The secrets are set | Dispatching the workflow. A missing secret fails the run naming it, and `gh secret list` shows which exist. A secret set wrongly shows only as the vendor's refusal |
| A rotated token survives into the next run | Dispatching with `force_refresh` ticked, then dispatching again with it unticked. The second run must authenticate with the token the first rotated in; both read in the run record as `ok` |
| A vendor's real response shape | Dispatching against the real service and reading the run record. The strict parser fails an item it does not recognise and names it, so a first run with failures is the evidence; the fix is a parser change plus the response saved as a fixture |
| A rate or quota allowance | Reading the counts in the record over the vendor's window, against the vendor's published limit. A count the job writes to the record, such as requests made, is what makes this readable |
| The watchdog trips | Running `node deadman.mjs --threshold-hours 0.01`, or `--now` an ISO instant a day ahead, locally with the record's secrets. It must exit 1 and print why |
| The public log leaks nothing | Reading a dispatched run's log in Actions: counts, dates, status, run id and error classes only |

An issue that touches the job's behaviour states in its acceptance criteria which
of these it needs. `/test` lists those criteria back; it does not mark them
passed. Per `/test`, a criterion not checked is a failure, not a pass.

## When a run fails

Every job's README carries a **"When a run fails"** table, one row per error
class: the error as it appears, what it means, and the fix. The person reading
it is looking at a failure email, not at the code.

| Error | Meaning | Fix |
|---|---|---|
| the class name, or the line the run prints | what went wrong, and whose side | the command to run, or "Nothing" if the next run heals it |

**Add a row with every new error class**, in the same pull request that
introduces the class. Write "Nothing" where the next run heals it: an outage retried on the next run needs
no action, and saying so stops a person acting on it.

## CI

One job per component in the project's `<slug>.yml`, in the form
`CONVENTIONS.md` §Continuous integration defines for multi-component projects:
Node 20, `npm ci`, `npm test`, run from `<slug>/<component>`. CI never runs the
job against a real service. The job, the scheduled workflow and the watchdog
workflow are in [scaffold.md](scaffold.md), beside this file. The two
workflows are named `<slug>-<job>.yml` and `<slug>-<job>-watchdog.yml`, the
`<slug>-<purpose>.yml` form, and neither is CI.

## Scaffold

The component scaffold — tree, `package.json`, the run record, the redaction
module, the watchdog, the token rotation helper and their tests — and the three
workflows are in [scaffold.md](scaffold.md). `/new-project` reads it when a
component is created; nothing in the issue lifecycle does, which is why it is
not here.
