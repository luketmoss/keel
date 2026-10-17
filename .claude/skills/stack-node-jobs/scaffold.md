# node-jobs stack scaffold

Moved out of [SKILL.md](SKILL.md) so that the file every lifecycle command
reads carries only what those commands act on. Nothing here is reachable from
`/pm`, `/develop`, `/test` or `/review` — it is read once, by `/new-project`,
when a component of this stack is created.

Drawn from Thrive's `sync/`, cut down to the part every scheduled job needs: a
run that writes one record last whatever happened, a redaction module, a
watchdog that reads the record, and the token rotation rules. Nothing in it is
specific to a vendor.

## Scaffold

`<component>` is the path the project's `## Stacks` table gives this stack,
usually `sync`. `<job>` names one scheduled job, `coros-sync` for example.

```
<slug>/<component>/
├── package.json
├── package-lock.json
├── .gitignore            # node_modules/
├── README.md             # the "When a run fails" table
├── run.mjs               # the scheduled entry
├── deadman.mjs           # the watchdog's entry
├── src/
│   ├── errors.mjs
│   ├── redact.mjs
│   ├── run-log.mjs
│   ├── job.mjs           # the work itself: replace this
│   ├── job-run.mjs
│   ├── record-store.mjs  # the durable log: replace this
│   ├── deadman.mjs
│   └── rotate.mjs        # delete if the job holds no rotating token
└── test/
    ├── helpers.mjs
    ├── job-run.test.mjs
    ├── deadman.test.mjs
    ├── redact.test.mjs
    ├── rotate.test.mjs
    └── fixtures/         # a vendor's real responses, as committed JSON
```

And in the repository's root `.gitattributes`, if it is not there already:

```
*.js text eol=lf
*.mjs text eol=lf
```

Transcribe the files below rather than inventing them. The component has no
dependencies to start with, so `package-lock.json` is a few lines: write it as
given, and run `npm install` after adding the first dependency. CI uses `npm ci`,
which refuses to run without one. `npm test` is the whole suite, and it needs no
network and no secret.

Two files are placeholders by design. `src/job.mjs` is the work, and
`src/record-store.mjs` is wherever the run record lives (SKILL.md, The run
record). Everything else is the shape the points in SKILL.md ask for.

### package.json

```json
{
  "name": "<slug>-<component>",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "start": "node run.mjs"
  },
  "engines": {
    "node": ">=20"
  }
}
```

### package-lock.json

```json
{
  "name": "<slug>-<component>",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "<slug>-<component>",
      "version": "1.0.0",
      "engines": {
        "node": ">=20"
      }
    }
  }
}
```

### .gitignore

```
node_modules/
```

### README.md

```markdown
# <slug>-<component>

What the job does and when it runs, in a few lines. Credentials: a table of
what each secret or stored token is, where it lives and whether it rotates.

## When a run fails

Add a row with every new error class, before the change merges.

| Error | Meaning | Fix |
|---|---|---|
| `GrantDeadError` | The vendor refused the stored refresh token, and the store held no newer one | Authorize again, locally |
| `PersistError` | A rotated token could not be written to the store | Re-run the workflow. If it then reports a dead grant, authorize again |
| `RecordNotConfigured` | The record store's secrets are missing | Set the Actions secrets the workflow names |
| `<job>-watchdog`: `has not run for N hours` | No run has recorded a row within the threshold | Actions → `<job>`: is the schedule enabled, and are runs cancelled or timing out? |
```

### src/errors.mjs

Each error names what a person has to do, because the person reading it is
looking at a failure email, not at this code.

```javascript
export class GrantDeadError extends Error {
  constructor(detail) {
    super(`The vendor refused the stored refresh token (${detail}). The grant is dead: authorize again, locally. See README.md.`);
    this.name = 'GrantDeadError';
  }
}

export class PersistError extends Error {
  constructor(detail) {
    super(`A rotated token could not be written to the store (${detail}). The run stopped before using it. If the next run reports a dead grant, authorize again.`);
    this.name = 'PersistError';
  }
}

export class RecordNotConfigured extends Error {
  constructor(missing) {
    super(`${missing.join(' and ')} not set, so no run record can be written. Set the Actions secrets.`);
    this.name = 'RecordNotConfigured';
  }
}
```

### src/redact.mjs

```javascript
// A secret never reaches a log line, an error message or stdout. The repo is
// public, so the Actions log is too.
//
// Two layers: known secret values are replaced wherever they appear, and any
// JSON field or parameter named like a credential is masked whatever its value.
// The first catches a token echoed inside prose; the second catches one never
// seen.

const known = new Set();

/** Register a secret when it is first read. Shorter than 8 characters is ignored. */
export function registerSecret(value) {
  if (typeof value === 'string' && value.length >= 8) known.add(value);
}

/** For tests only. */
export function clearSecrets() {
  known.clear();
}

export function redact(text) {
  let out = String(text ?? '');
  for (const secret of known) out = out.split(secret).join('[redacted]');
  out = out.replace(
    /("(?:access_token|refresh_token|id_token|client_secret)"\s*:\s*")[^"]*(")/gi,
    '$1[redacted]$2',
  );
  out = out.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/g, '$1[redacted]');
  // `\b` keeps `grant_type=authorization_code` readable.
  out = out.replace(
    /\b((?:code|access_token|refresh_token|client_secret)=)[^&\s"'<>]+/gi,
    '$1[redacted]',
  );
  return out;
}
```

### src/run-log.mjs

The run record and what a run prints. `summary` mode, which the workflow sets,
prints counts, dates, the status, the run id and error class names, and nothing
the vendor sent. The detail goes in the record's `error_detail`.

```javascript
import { redact } from './redact.mjs';

export const STATUSES = ['ok', 'partial', 'failed'];

/** `<event>-<run id>-<attempt>` in Actions, else `local-<startedAt>`. */
export function runIdFor(env, startedAt) {
  if (env.GITHUB_ACTIONS === 'true' && env.GITHUB_RUN_ID) {
    return `${env.GITHUB_EVENT_NAME || 'actions'}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT || '1'}`;
  }
  return `local-${startedAt}`;
}

/** `summary` when JOB_LOG says so; anything else logs in full. */
export const logModeFor = (env) => (env.JOB_LOG === 'summary' ? 'summary' : 'full');

/**
 * The run's one record. `fatal` is the error that aborted the run, if one did;
 * it leads `error_detail` as `<ErrorName>: <message>`. `failures` are things
 * that went wrong while the run carried on. Everything is redacted.
 */
export function buildRecord({ runId, startedAt, finishedAt, counts = {}, failures = [], fatal = null, notes = [] }) {
  const lines = [];
  if (fatal) lines.push(`${fatal.name || 'Error'}: ${redact(fatal.message || String(fatal))}`);
  for (const f of failures) lines.push(redact(f));
  return {
    run_id: runId,
    started_at: startedAt,
    finished_at: finishedAt,
    n_seen: counts.seen ?? 0,
    n_errors: failures.length + (fatal ? 1 : 0),
    status: fatal ? 'failed' : failures.length ? 'partial' : 'ok',
    error_detail: lines.join('\n'),
    notes: notes.map((n) => redact(n)).join('\n'),
  };
}

/** `detail` is dropped in summary mode; `info` is safe in both: fixed text and counts. */
export function createRunOutput(mode, { out = console.log, err = console.error } = {}) {
  const full = mode !== 'summary';
  return {
    mode,
    detail: full ? out : () => {},
    info: out,
    failures(runId, failures) {
      if (!failures.length) return;
      if (full) {
        err(`${failures.length} failure(s):`);
        for (const f of failures) err(`  ${redact(f)}`);
      } else {
        err(`${failures.length} failure(s). They are in the run record ${runId}, not in this public log.`);
      }
    },
    /** The error that aborted the run: in summary mode, its class alone. */
    fatal(runId, e) {
      if (full) err(`${e.name ?? 'Error'}: ${redact(e.message || String(e))}`);
      else err(`Aborted by ${e.name ?? 'Error'}. See "When a run fails" in README.md; the message is in the run record ${runId}.`);
    },
    /** The record itself could not be written: nothing durable holds this run. */
    recordWriteFailed(runId, e) {
      if (full) err(`Run record ${runId} was not written: ${redact(e.message || String(e))}`);
      else err(`Run record ${runId} was not written: ${e.name ?? 'Error'}. Run \`node run.mjs\` locally for the full log.`);
    },
  };
}

/** The one-line account of a run, safe for a public log. */
export function summaryLine(row) {
  return `Run ${row.run_id}: ${row.status}. ${row.n_seen} seen; ${row.n_errors} failure(s).`;
}
```

### src/job.mjs

The work. Replace the body; keep the contract. It returns what it saw and what
went wrong without stopping, and throws only when the run cannot continue.

```javascript
/**
 * @param {{ env: object, now: () => Date, log: (line: string) => void }} ctx
 * @returns {Promise<{ seen: number, failures: string[], notes?: string[] }>}
 */
export async function work({ env, now, log }) {
  log(`Nothing to do yet, at ${now().toISOString()}.`);
  return { seen: 0, failures: [] };
}
```

### src/record-store.mjs

Where the run record lives. It is one seam with two methods, `append(row)` and
`latest()`, and it must be somewhere a run's end does not erase: a sheet, a
database, a file in storage the job rewrites. This version posts JSON to an
endpoint, as a placeholder. `append` must not write a re-sent `run_id` twice.

```javascript
import { RecordNotConfigured } from './errors.mjs';

/** @returns {{ append: (row: object) => Promise<object>, latest: () => Promise<object | undefined> }} */
export function createRecordStore(env = process.env, fetchImpl = fetch) {
  const missing = ['RECORD_URL', 'RECORD_KEY'].filter((name) => !env[name]);
  if (missing.length) throw new RecordNotConfigured(missing);

  async function call(body) {
    const res = await fetchImpl(env.RECORD_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RECORD_KEY}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`record store answered HTTP ${res.status}`);
    return res.json();
  }

  return {
    append: (row) => call({ action: 'append', row }),
    latest: async () => (await call({ action: 'latest' })).row,
  };
}
```

### src/job-run.mjs

One run, start to record. The record is written last, whatever happened, and the
exit code agrees with it: 0 only for `ok` with the record written.

```javascript
import { work } from './job.mjs';
import { createRecordStore } from './record-store.mjs';
import { createRunOutput, logModeFor, buildRecord, runIdFor, summaryLine } from './run-log.mjs';

export const defaultDeps = { work, createStore: createRecordStore };

/**
 * @returns {Promise<{ exitCode: number, row: object, logged: boolean }>}
 */
export async function jobRun({ env = process.env, now = () => new Date(), deps = defaultDeps, output } = {}) {
  const d = { ...defaultDeps, ...deps };
  const startedAt = now().toISOString();
  const runId = runIdFor(env, startedAt);
  const out = output ?? createRunOutput(logModeFor(env));

  // Missing record secrets cost the record, never the work: do the work first,
  // then fail naming them.
  let store = null;
  let storeError = null;
  try {
    store = d.createStore(env);
  } catch (err) {
    storeError = err;
  }

  const counts = {};
  const failures = [];
  const notes = [];
  let fatal = null;
  try {
    const result = await d.work({ env, now, log: out.detail });
    counts.seen = result.seen;
    failures.push(...result.failures);
    notes.push(...(result.notes ?? []));
  } catch (err) {
    fatal = err;
  }

  const row = buildRecord({ runId, startedAt, finishedAt: now().toISOString(), counts, failures, fatal, notes });

  if (fatal) out.fatal(runId, fatal);
  out.failures(runId, failures);

  let logged = false;
  if (store) {
    try {
      await store.append(row);
      logged = true;
      out.info(`Run record ${runId} appended.`);
    } catch (err) {
      out.recordWriteFailed(runId, err);
    }
  } else {
    out.recordWriteFailed(runId, storeError);
  }
  out.info(summaryLine(row));

  return { exitCode: row.status === 'ok' && logged ? 0 : 1, row, logged };
}
```

### run.mjs

```javascript
#!/usr/bin/env node
// One run (src/job-run.mjs): the work, then the run's one record.
//
//   node run.mjs
//
// JOB_LOG=summary (set by the workflow) keeps the vendor's data out of the
// public Actions log; the detail is in the run record. Unset, a local run logs
// everything.
//
// Exits non-zero if anything failed, so Actions' failure email fires.

import { redact } from './src/redact.mjs';
import { jobRun } from './src/job-run.mjs';

jobRun()
  .then(({ exitCode }) => {
    process.exitCode = exitCode;
  })
  .catch((err) => {
    // jobRun records its own failures; reaching here is a bug in it.
    const full = process.env.JOB_LOG !== 'summary';
    console.error(full ? `${err.name ?? 'Error'}: ${redact(err.message || String(err))}` : `Unexpected ${err.name ?? 'Error'}.`);
    process.exit(1);
  });
```

### src/deadman.mjs

The watchdog's logic. It asks only whether the job ran, not whether it
succeeded: a failed run already sends the failure email. Choose the threshold by
the rule in SKILL.md; the schedule here is `23 1,7,13,19 * * *`, runs 6 hours
apart, so one dropped run leaves 12 hours and an hour of scheduler delay makes
13.

```javascript
export const DEFAULT_THRESHOLD_HOURS = 13;

const HOUR = 60 * 60 * 1000;

/**
 * @param {{ store: { latest: () => Promise<object | undefined> },
 *   now?: Date, thresholdHours?: number }} opts
 * @returns {Promise<{ ok: boolean, message: string }>}
 *   Never throws for an unreadable record: that is `ok: false` too.
 */
export async function checkFreshness({ store, now = new Date(), thresholdHours = DEFAULT_THRESHOLD_HOURS }) {
  if (!(thresholdHours > 0)) throw new Error(`threshold must be a positive number of hours, got ${thresholdHours}`);
  let newest;
  try {
    newest = await store.latest();
  } catch (err) {
    return {
      ok: false,
      message: `Could not read the run record (${err.name ?? 'Error'}), so nobody can tell whether the job is running. The job writes through the same store, so it is probably failing too.`,
    };
  }
  if (!newest) return { ok: false, message: `The run record is empty: the job has never recorded a run (threshold ${thresholdHours} h).` };

  const started = Date.parse(newest.started_at);
  if (Number.isNaN(started)) {
    return { ok: false, message: `The newest run record, ${newest.run_id}, has an unreadable started_at ("${newest.started_at}").` };
  }
  const ageHours = (now.getTime() - started) / HOUR;
  const described = `newest run ${newest.run_id} started ${newest.started_at}, ${ageHours.toFixed(1)} h ago, status ${newest.status || '(blank)'}; threshold ${thresholdHours} h`;
  if (ageHours > thresholdHours) {
    return {
      ok: false,
      message: `The job has not run for ${ageHours.toFixed(1)} hours: ${described}. Check Actions: is its schedule still enabled, and are runs being cancelled or timing out?`,
    };
  }
  return { ok: true, message: `The job is running: ${described}.` };
}

/** `--now <ISO>` and `--threshold-hours <n>`, for proving the check trips without touching real data. */
export function parseDeadmanArgs(argv) {
  const value = (flag) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const nowArg = value('--now');
  const thresholdArg = value('--threshold-hours');
  const now = nowArg === undefined ? new Date() : new Date(nowArg);
  if (Number.isNaN(now.getTime())) throw new Error(`--now must be an ISO instant, got "${nowArg}"`);
  const thresholdHours = thresholdArg === undefined ? DEFAULT_THRESHOLD_HOURS : Number(thresholdArg);
  if (!(thresholdHours > 0)) throw new Error(`--threshold-hours must be a positive number, got "${thresholdArg}"`);
  return { now, thresholdHours };
}
```

### deadman.mjs

```javascript
#!/usr/bin/env node
// The dead-man's switch: exits 1 when the newest run record is older than the
// threshold, so Actions' failure email reports a job that stopped firing. Run
// by .github/workflows/<slug>-<job>-watchdog.yml.
//
//   node deadman.mjs [--threshold-hours 13] [--now 2026-09-25T12:00:00Z]
//
// `--now` and `--threshold-hours` prove it trips without touching real data.
// It needs RECORD_URL and RECORD_KEY, and no npm install: it imports nothing
// outside src/ that is not in this repository. Its output names run ids,
// timestamps and a status, never vendor data, so it is safe in a public log.

import { checkFreshness, parseDeadmanArgs } from './src/deadman.mjs';
import { createRecordStore } from './src/record-store.mjs';

try {
  const { now, thresholdHours } = parseDeadmanArgs(process.argv.slice(2));
  const result = await checkFreshness({ store: createRecordStore(), now, thresholdHours });
  (result.ok ? console.log : console.error)(result.message);
  process.exitCode = result.ok ? 0 : 1;
} catch (err) {
  console.error(`${err.name ?? 'Error'}: ${err.message}`);
  process.exitCode = 1;
}
```

### src/rotate.mjs

The token rotation rules, once. A workflow cannot rewrite its own secrets, so a
token that rotates on refresh lives in a store the job rewrites (`load()` and
`save(tokens)`). Delete this file and its test if the job holds no such token.

```javascript
import { GrantDeadError, PersistError } from './errors.mjs';
import { redact, registerSecret } from './redact.mjs';

/**
 * The access token a run uses.
 *
 * - Refresh only near expiry: `refreshWithinMs` is how close is close.
 * - `refresh(tokens)` makes one refresh, with its own retries, and returns the
 *   new set (`access_token`, `refresh_token`, `access_expires_at`) or throws.
 * - `isInvalidGrant(err)` says the refresh token itself was refused.
 */
export async function currentAccessToken({
  store, refresh, isInvalidGrant, refreshWithinMs, now = () => Date.now(), force = false,
}) {
  const current = await store.load();
  if (!current?.refresh_token) throw new GrantDeadError('no token in the store');
  registerSecret(current.access_token);
  registerSecret(current.refresh_token);

  const expiresAt = Date.parse(current.access_expires_at);
  if (!force && current.access_token && expiresAt - now() > refreshWithinMs) {
    return { accessToken: current.access_token, refreshed: false };
  }
  const next = await rotateAndPersist({ store, current, refresh, isInvalidGrant });
  return { accessToken: next.access_token, refreshed: true };
}

/**
 * One refresh, one re-read of the store when the refresh token is refused, and
 * persist before use. Only a *different* refresh token in the store is worth
 * presenting after a refusal: the same one would be refused the same way.
 * Never two at once is the workflow's concurrency group, not this code.
 */
export async function rotateAndPersist({ store, current, refresh, isInvalidGrant }) {
  let next;
  try {
    next = await refresh(current);
  } catch (err) {
    if (!isInvalidGrant(err)) throw err;
    // Another process may have rotated first.
    const latest = await store.load();
    if (!latest?.refresh_token || latest.refresh_token === current.refresh_token) {
      throw new GrantDeadError(redact(err.message));
    }
    try {
      next = await refresh(latest);
    } catch (retryErr) {
      if (isInvalidGrant(retryErr)) throw new GrantDeadError(redact(retryErr.message));
      throw retryErr;
    }
  }
  // The old refresh token is spent: the new one must be saved before anything
  // else happens with it.
  registerSecret(next.access_token);
  registerSecret(next.refresh_token);
  try {
    await store.save(next);
  } catch (err) {
    throw new PersistError(redact(err.message || String(err)));
  }
  return next;
}
```

### test/helpers.mjs

Fakes. No test touches the network or reads a secret. The fixtures directory
holds a vendor's real responses once the job has some; a test feeds them to the
parser instead of calling the vendor.

```javascript
/** An in-memory run record store with the same contract as record-store.mjs. */
export function memoryRecordStore({ failAppend = false } = {}) {
  const rows = [];
  return {
    rows,
    async append(row) {
      if (failAppend) throw new Error('store is down');
      if (!rows.some((r) => r.run_id === row.run_id)) rows.push(row);
      return { status: 'appended' };
    },
    async latest() {
      return rows[rows.length - 1];
    },
  };
}

/** An in-memory token store with the same contract as the real one. */
export function memoryTokenStore(initial, { onSave } = {}) {
  let tokens = initial ? { ...initial } : null;
  const events = [];
  return {
    events,
    get tokens() { return tokens; },
    set tokens(t) { tokens = t; },
    async load() {
      events.push('load');
      return tokens ? { ...tokens } : null;
    },
    async save(next) {
      events.push('save');
      if (onSave) await onSave(next);
      tokens = { ...next };
    },
  };
}

/** A silent run output, so tests print nothing. */
export const quiet = {
  mode: 'summary', detail() {}, info() {}, failures() {}, fatal() {}, recordWriteFailed() {},
};

export const NOW = Date.parse('2026-09-24T09:23:00Z');
export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
```

### test/job-run.test.mjs

The example test. Delete it once real tests cover the same ground; until then it
is the difference between `npm test` proving something and proving nothing.
Remove the `fatal ? 'failed'` branch from `buildRecord` and the second test
fails; remove the `store.append` call from `jobRun` and the first four do.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobRun } from '../src/job-run.mjs';
import { RecordNotConfigured } from '../src/errors.mjs';
import { memoryRecordStore, quiet, NOW } from './helpers.mjs';

const now = () => new Date(NOW);
const env = { GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '42', GITHUB_EVENT_NAME: 'schedule' };

test('a clean run writes one ok record and exits 0', async () => {
  const store = memoryRecordStore();
  const { exitCode, row } = await jobRun({
    env, now, output: quiet,
    deps: { createStore: () => store, work: async () => ({ seen: 3, failures: [] }) },
  });
  assert.equal(exitCode, 0);
  assert.equal(store.rows.length, 1);
  assert.equal(row.status, 'ok');
  assert.equal(row.run_id, 'schedule-42-1');
  assert.equal(row.n_seen, 3);
});

test('a run that throws writes a failed record, led by the error class, and exits 1', async () => {
  const store = memoryRecordStore();
  const boom = Object.assign(new Error('the vendor said no'), { name: 'GrantDeadError' });
  const { exitCode } = await jobRun({
    env, now, output: quiet,
    deps: { createStore: () => store, work: async () => { throw boom; } },
  });
  assert.equal(exitCode, 1);
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].status, 'failed');
  assert.equal(store.rows[0].n_errors, 1);
  assert.match(store.rows[0].error_detail, /^GrantDeadError: the vendor said no/);
});

test('a run that carried on past a failure is partial, and exits 1', async () => {
  const store = memoryRecordStore();
  const { exitCode } = await jobRun({
    env, now, output: quiet,
    deps: { createStore: () => store, work: async () => ({ seen: 5, failures: ['item 4 not written'] }) },
  });
  assert.equal(exitCode, 1);
  assert.equal(store.rows[0].status, 'partial');
});

test('a record that cannot be written fails the run even when the work was clean', async () => {
  const { exitCode, logged } = await jobRun({
    env, now, output: quiet,
    deps: { createStore: () => memoryRecordStore({ failAppend: true }), work: async () => ({ seen: 1, failures: [] }) },
  });
  assert.equal(exitCode, 1);
  assert.equal(logged, false);
});

test('missing record secrets cost the record, never the work', async () => {
  let worked = false;
  const { exitCode } = await jobRun({
    env, now, output: quiet,
    deps: {
      createStore: () => { throw new RecordNotConfigured(['RECORD_URL']); },
      work: async () => { worked = true; return { seen: 1, failures: [] }; },
    },
  });
  assert.equal(worked, true);
  assert.equal(exitCode, 1);
});
```

### test/deadman.test.mjs

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFreshness, DEFAULT_THRESHOLD_HOURS } from '../src/deadman.mjs';
import { memoryRecordStore, NOW, HOUR } from './helpers.mjs';

const recordAt = (msBefore) => ({
  run_id: 'schedule-1-1', status: 'ok', started_at: new Date(NOW - msBefore).toISOString(),
});

test('a record inside the threshold is alive, whatever its status', async () => {
  const store = memoryRecordStore();
  await store.append({ ...recordAt(12 * HOUR), status: 'failed' });
  assert.equal((await checkFreshness({ store, now: new Date(NOW) })).ok, true);
});

test('a record past the threshold trips', async () => {
  const store = memoryRecordStore();
  await store.append(recordAt((DEFAULT_THRESHOLD_HOURS + 1) * HOUR));
  const result = await checkFreshness({ store, now: new Date(NOW) });
  assert.equal(result.ok, false);
  assert.match(result.message, /has not run for/);
});

test('an empty or unreadable record trips', async () => {
  assert.equal((await checkFreshness({ store: memoryRecordStore(), now: new Date(NOW) })).ok, false);
  const broken = { latest: async () => { throw new Error('down'); } };
  assert.equal((await checkFreshness({ store: broken, now: new Date(NOW) })).ok, false);
});
```

### test/redact.test.mjs

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearSecrets, redact, registerSecret } from '../src/redact.mjs';

test('a registered secret is masked wherever it appears', () => {
  clearSecrets();
  registerSecret('s3cr3t-value-123');
  assert.equal(redact('failed with s3cr3t-value-123 in the URL'), 'failed with [redacted] in the URL');
});

test('a credential field is masked though never registered', () => {
  clearSecrets();
  const out = redact('{"refresh_token":"abc123xyz","note":"kept"} Bearer eyJhbGci.x refresh_token=zzz999');
  assert.doesNotMatch(out, /abc123xyz|eyJhbGci|zzz999/);
  assert.match(out, /"note":"kept"/);
});
```

### test/rotate.test.mjs

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentAccessToken } from '../src/rotate.mjs';
import { GrantDeadError, PersistError } from '../src/errors.mjs';
import { memoryTokenStore, NOW, DAY } from './helpers.mjs';

const stored = (expiresInMs, refresh = 'refresh-token-0-xxxx') => ({
  access_token: 'access-token-0-xxxx', refresh_token: refresh,
  access_expires_at: new Date(NOW + expiresInMs).toISOString(),
});
const invalid = () => Object.assign(new Error('invalid_grant'), { code: 'invalid_grant' });
const isInvalidGrant = (err) => err.code === 'invalid_grant';
const base = { isInvalidGrant, refreshWithinMs: 5 * DAY, now: () => NOW };

test('a token far from expiry is not refreshed', async () => {
  const store = memoryTokenStore(stored(20 * DAY));
  let calls = 0;
  const r = await currentAccessToken({ ...base, store, refresh: async () => { calls++; } });
  assert.equal(r.refreshed, false);
  assert.equal(calls, 0);
});

test('a rotated token is saved before it is returned', async () => {
  const store = memoryTokenStore(stored(1 * DAY));
  const next = { access_token: 'access-token-1-xxxx', refresh_token: 'refresh-token-1-xxxx', access_expires_at: 'x' };
  const r = await currentAccessToken({ ...base, store, refresh: async () => next });
  assert.equal(r.accessToken, 'access-token-1-xxxx');
  assert.deepEqual(store.events, ['load', 'save']);
  assert.equal(store.tokens.refresh_token, 'refresh-token-1-xxxx');
});

test('invalid_grant re-reads the store once and retries with a different token', async () => {
  const store = memoryTokenStore(stored(1 * DAY));
  const seen = [];
  const next = { access_token: 'access-token-2-xxxx', refresh_token: 'refresh-token-2-xxxx', access_expires_at: 'x' };
  const refresh = async (tokens) => {
    seen.push(tokens.refresh_token);
    if (seen.length === 1) {
      store.tokens = stored(1 * DAY, 'refresh-token-9-xxxx'); // another process rotated first
      throw invalid();
    }
    return next;
  };
  const r = await currentAccessToken({ ...base, store, refresh });
  assert.deepEqual(seen, ['refresh-token-0-xxxx', 'refresh-token-9-xxxx']);
  assert.equal(r.refreshed, true);
});

test('invalid_grant with the same token in the store is a dead grant, after one re-read', async () => {
  const store = memoryTokenStore(stored(1 * DAY));
  await assert.rejects(
    currentAccessToken({ ...base, store, refresh: async () => { throw invalid(); } }),
    GrantDeadError,
  );
  assert.deepEqual(store.events, ['load', 'load']);
});

test('a token that cannot be saved stops the run', async () => {
  const store = memoryTokenStore(stored(1 * DAY), { onSave: () => { throw new Error('store down'); } });
  const next = { access_token: 'access-token-1-xxxx', refresh_token: 'refresh-token-1-xxxx', access_expires_at: 'x' };
  await assert.rejects(currentAccessToken({ ...base, store, refresh: async () => next }), PersistError);
});
```

## Workflows

Two files in the repository's `.github/workflows/`, outside the component. Both
are named `<slug>-<purpose>.yml` per `CONVENTIONS.md` §Continuous integration,
and neither is CI: the CI job is the one below. `<job>` names the job, and the
workflow's `name:` is the file's name without `.yml`.

A scheduled workflow runs from the default branch only, so it does nothing until
it merges. Its first real run is therefore after the merge, not in the pull
request (SKILL.md, Testing).

### .github/workflows/<slug>-<job>.yml

```yaml
name: <slug>-<job>

# What the job does, in one line. <slug>-<job>-watchdog.yml is its dead-man's
# switch.
on:
  # 01:23, 07:23, 13:23 and 19:23 UTC. One expression, never a second line:
  # two would double-run on a DST changeover day. DST drift is accepted, not
  # corrected. The odd minute dodges the top-of-hour crowd GitHub delays or
  # drops, and sits clear of the watchdog's.
  schedule:
    - cron: '23 1,7,13,19 * * *'
  workflow_dispatch:

# Never two runs at once, and never cancel one. The job rotates a token or
# writes non-idempotently, and a cancelled run could die between the two. Queue.
#
# GitHub keeps at most one pending run per group: a newer one cancels an older
# pending one. That run never started and writes no record, so the run window
# must cover a dropped run.
concurrency:
  group: <slug>-<job>
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    defaults:
      run:
        working-directory: <slug>/<component>
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: <slug>/<component>/package-lock.json
      - run: npm ci
      - name: run
        run: node run.mjs
        env:
          # The repo is public, and so is this log: counts, dates, status, run
          # id and error class names only. The detail goes to the run record.
          JOB_LOG: summary
          # Name every secret the job reads, and no others: secrets are
          # repo-wide, so this list is the only boundary.
          RECORD_URL: ${{ secrets.RECORD_URL }}
          RECORD_KEY: ${{ secrets.RECORD_KEY }}
```

### .github/workflows/<slug>-<job>-watchdog.yml

```yaml
name: <slug>-<job>-watchdog

# The dead-man's switch for <slug>-<job>. A job that does not run cannot report
# itself, so this is a separate workflow on its own schedule. It fails, and
# Actions' failure email fires, when the newest run record, of any status, is
# older than the threshold in deadman.mjs, or the record is empty or unreadable.
#
# It cannot catch GitHub's scheduler stopping for the whole repository, and
# that includes the auto-disable after 60 days without activity on a public
# repo, which stops this workflow too.
on:
  # Every 3 hours at :47, clear of the job's :23. Once tripped, it fails on
  # every run until the job records one.
  schedule:
    - cron: '47 */3 * * *'
  workflow_dispatch:

# Deliberately not the job's group: this only reads, and joining that group
# could cancel a pending run of the job. A read-only run may be cancelled.
concurrency:
  group: <slug>-<job>-watchdog
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    defaults:
      run:
        working-directory: <slug>/<component>
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '20'
      # No npm ci: deadman.mjs imports only files in this repository.
      - name: dead-man check
        run: node deadman.mjs
        env:
          RECORD_URL: ${{ secrets.RECORD_URL }}
          RECORD_KEY: ${{ secrets.RECORD_KEY }}
```

## CI job

One job in the project's `<slug>.yml`, named after the component. The project's
trigger filter (`<slug>/**` and the workflow's own file), concurrency group and
cache-key prefix are unchanged and are not repeated here; per
`CONVENTIONS.md` §Continuous integration this job runs on any change in the
project folder. `<slug>/<component>` is the component's directory. It runs the
suite and nothing else: the schedule is the two workflows above, and CI never
runs the job against a real service.

```yaml
  <component>:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: <slug>/<component>
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: <slug>/<component>/package-lock.json
      - run: npm ci
      - run: npm test
```
