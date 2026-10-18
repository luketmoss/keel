# CLAUDE.md — thrive

Personal workout and health tracker: a Preact SPA over a Google Sheet
("Groundwork"), with an Apps Script API in front of the sheet and scheduled
syncs that pull activities from COROS and body measurements from Withings.
Personal use.

Workspace rules live in the root `CLAUDE.md` and `CONVENTIONS.md`: the board,
the pipeline and its skills, and CI. This file covers only what is specific to
Thrive.

## History

Thrive moved here from `luketmoss/thrive` (read-only, archived as #399's
last step) in #385: imported with
its history (#395), deployed at `luketmoss.github.io/keel/thrive/` (#396), and
its syncs and poller cut over (#398, #399). Its issues from before the move
stay in that repo and are cited `luketmoss/thrive#N`; a bare `#N` here is a
Keel issue. The old URL, `luketmoss.github.io/thrive/`, only redirects here,
and nothing should link to it.

The sync and watchdog workflows are `thrive-coros-sync.yml`,
`thrive-withings-sync.yml` and their watchdogs. Both sync jobs are gated by the
repository variable `THRIVE_SYNCS_LIVE`, the documented off switch. Never
re-enable the old repo's copies while it is on: two copies running at once
kill the vendors' refresh tokens.

## Stacks

| Path | Stack |
|---|---|
| `frontend/` | web |
| `apps-script/` | apps-script |
| `sync/` | node-jobs |
| `scripts/` | — |

**View library:** preact

The authoritative conventions for each component are in its stack skill:
`.claude/skills/stack-web/SKILL.md`, `.claude/skills/stack-apps-script/SKILL.md`
and `.claude/skills/stack-node-jobs/SKILL.md`. `scripts/` pins none; this file
is its only authority.

- **frontend/** — the Preact SPA, built with Vite. It reads and writes the
  Sheets API directly with the signed-in user's Google token, with one
  exception: after a Sync now press it asks the API's `requestSync` to dispatch
  the rows it just appended (`frontend/src/api/thrive-api.ts`, built only when
  `VITE_THRIVE_API_URL` is set).
- **apps-script/** — the server-side API over the sheet. Every consumer that is
  not the SPA (the syncs, the MCP Worker) calls it rather than holding its own
  row mapping.
- **sync/** — the COROS and Withings syncs, run on a schedule. They reach Drive
  as the bot account (luketmossbot@gmail.com, `drive.file`), **not** the
  service account, which has no Drive storage quota, and keep the vendors'
  rotating refresh tokens in Drive files they own. Setup and failure modes:
  `sync/README.md`.
- **scripts/** — one-time migrations and admin tools. They use the Google
  service account (`scripts/thrive-sa.json`, gitignored) directly, with their
  own `google-auth-library`, because schema changes need Sheets access the API
  deliberately does not offer.
- **The MCP server** is not here: it is Keel's `mcp/`, a Cloudflare Worker
  serving `/thrive/mcp` as a thin client of the Apps Script API with its own
  MCP-only key (`MCP_API_KEY`). It holds no row mapping.
- **`.claude/skills/brief/`** — `/brief`, the Morning and Weekly Brief. A
  product, not part of the pipeline: two scheduled tasks run it. Its
  `settings.local.md` (weather locations) is gitignored and never committed.

## Key commands

- `npm --prefix frontend run dev` — Vite dev server on port 5175
- `cd frontend && npm test` / `npm run typecheck` / `npm run build`
- `cd apps-script && npm test` / `npm run typecheck` — sandboxed `node:vm`
- `cd sync && npm test` — `node --test`, no network

## Change both together

Thrive is one repository now, so each pair below changes in **one pull
request**.

- **The row mapping.** `apps-script/src/types.js` and `frontend/src/api/*.ts`
  are the only two copies. A column or field changes in both.
- **Response shapes.** A change to `apps-script/` that alters a response shape
  also changes the MCP Worker's client in `mcp/src/thrive/`, or its tools break
  silently. A pull request touching `mcp/` is human-reviewed (#393).
- **The COROS portal URL rule** (`corosActivityUrl`) has two copies:
  `frontend/src/api/coros-link.ts` and `mcp/src/thrive/domain.js`.

## Changing the schema

**Frozen.** No column or tab changes from the merge of #395 until #385 closes.

After that, a column or tab changes only like this:

1. Through a migration, `scripts/migrate-<issue>-<what>.mjs`, run by hand. No
   other path edits the sheet's shape.
2. **Columns are appended, never moved.** Agents, the API and the Worker read
   tabs by column position.
3. The API (`apps-script/`), the frontend mirror (`frontend/src/api/`) and the
   Worker (`mcp/src/thrive/`) change in the same pull request.
4. **Apps Script deploys first**, then its callers. Merging does not deploy it;
   the steps are the owner's, per the apps-script stack skill.

## Environment
- **Windows machine** — `jq` is NOT available. For JSON parsing in shell commands, use `gh` built-in `--jq` flags. Never pipe to a standalone `jq` command.
- `thrive/.gitattributes` pins `*.js`/`*.mjs` to LF (luketmoss/thrive#366): vitest cannot load a shebang script checked out with CRLF. A checkout from before luketmoss/thrive#366 needs those files re-checked out once.
- Node 20+, npm

## Architecture Notes
- Frontend uses direct `fetch()` to Google Sheets REST API (not gapi.client)
- Auth: Google Identity Services (GIS) token model
- State: @preact/signals (module-level signals, NOT useState for shared state)
- Styling: CSS custom properties in `global.css` (no CSS framework, no Tailwind)
- Router: Signal-based hash router using signals (no library dependency)
- Mobile-first design (375px primary breakpoint)
- No backend server — SPA reads/writes Sheets API directly via OAuth

## Data Model
Google Sheet "Groundwork" with these tabs:
- **Exercises** (A:E): id, Name, Tags, Notes, Created
- **Templates** (A:H): template_id, Template Name, Order, exercise_id, Exercise Name, Section, Sets, Reps
- **Workouts** (A:AB): id, Date, Time, Type, Name, template_id, Notes, Elapsed (s), Created, copied_from, status,
  Moving (s), Effort, Distance (m), Ascent (m), Descent (m), Avg HR (bpm),
  sub_type, source, source_activity_id, raw_ref, fit_ref, fit_fetched_at, synced_at, started_at_utc, calories,
  estimated_seconds, sport_type
- **Sets** (A:J): workout_id, exercise_id, Exercise Name, Section, Exercise Order, Set #, Planned Reps, Weight (lbs), Reps, Effort
- **Labels** (A:D): id, name, color_key, created
- **DailyHealth** (A:S): date, resting_hr, hrv, steps, calories, sleep_total_s,
  sleep_deep_s, sleep_rem_s, sleep_light_s, sleep_awake_s, sleep_score, vo2max,
  recovery, training_load, bed_time, wake_time, raw_ref, synced_at (luketmoss/thrive#165),
  stress_avg (luketmoss/thrive#231: COROS's daily average stress, appended; no range assumed). One
  row per local date, written only by the COROS sync through `upsertDailyHealth`.
  Every value is nullable: blank means COROS did not say, never `0`. Sleep is
  filed under its wake-up day; `sleep_total_s` includes awake time; `vo2max` and
  `recovery` are current-state snapshots. There is no step goal: COROS sends none.
  The SPA reads it, read-only, through `frontend/src/api/health-api.ts` (luketmoss/thrive#236).
- **BodyMeasurements** (A:T) — one row per Withings measure group (luketmoss/thrive#198),
  keyed by `grpid`, written only by the Withings sync (`sync/withings-run.mjs`)
  through `upsertBodyMeasurements`, which rewrites a row whole. A reading
  deleted in the Withings app is removed by `reconcileBodyMeasurements` (luketmoss/thrive#215),
  capped at 5 rows a run; its archive file is kept and marked.
  grpid, date, time, measured_at_utc, kind, device_model, weight_kg,
  fat_ratio_pct, fat_mass_kg, fat_free_mass_kg, muscle_mass_kg, hydration_kg,
  bone_mass_kg, systolic_mmhg, diastolic_mmhg, pulse_bpm, attrib, source,
  raw_ref, synced_at. One tab for both devices: `kind` is `scale` or `bp`.
  **SI units stored** (kg, never lb): the kg → lb display belongs to the
  consumers that display it, and `Sets!Weight` stays in lbs. Every measure is
  nullable: blank means the group had no such measure, never `0`. `date`/`time`
  are local `America/Denver`. Groups with an `attrib` other than 0, 2, 4, 5, 7
  or 8 (1 is a guest or another user) are never written. The SPA reads it,
  read-only and still in kg, through `frontend/src/api/health-api.ts` (luketmoss/thrive#236).
  Later columns are only ever appended.
- **DailySummary** (A:Y) — **derived, never authoritative** (luketmoss/thrive#131). One row per
  local calendar day, rebuildable at any time from `Workouts` + `DailyHealth` +
  `BodyMeasurements`. Nothing writes here by hand. If it disagrees with
  `Workouts`, `Workouts` is right and this is stale. The SPA reads it,
  read-only, through `frontend/src/api/health-api.ts` (luketmoss/thrive#236), and never
  rebuilds or corrects it.
  date, activity_count, activity_types, total_moving_s, total_elapsed_s,
  total_distance_m, total_ascent_m, cardio_activity_count, distance_withdata,
  ascent_withdata, max_effort, effort_counts, steps, resting_hr, hrv,
  sleep_total_s, training_load, computed_at, moving_withdata, elapsed_withdata,
  weight_kg, fat_ratio_pct, systolic_mmhg, diastolic_mmhg, bp_count.
  Every total carries its coverage: `total_moving_s`/`total_elapsed_s` are blank
  when no activity recorded them, and S/T count those that did out of
  `activity_count` (luketmoss/thrive#181). S/T are appended, not beside D/E, because agents and the API read
  this tab by column: never move a column here.
  `total_distance_m`/`total_ascent_m` are **outdoor only**, so they will not
  equal the sum of a day's activity distances on any day with an indoor
  session — correct, and surprising, so say so wherever it is displayed.
  They are likewise blank when no outdoor session measured them, with I/J
  counting those that did out of H (luketmoss/thrive#190). A measured `0` stays `0`.
  U:Y (luketmoss/thrive#203) roll up `BodyMeasurements`, appended after T for the same
  column-position reason. `weight_kg`/`fat_ratio_pct` come from the day's
  **first** scale reading with a weight, by `measured_at_utc` — a morning
  weigh-in is the comparable figure day to day, and fat ratio is read from
  that same reading, never mixed in from another. `systolic_mmhg`/
  `diastolic_mmhg` are the **mean** of the day's BP readings, rounded half up
  to whole mmHg, with `bp_count` counting the readings themselves, not the
  values present in them. Either half is blank, never `0`, on a day with no
  such reading; a body-only day still gets a row, everything else blank as
  usual. A missing `BodyMeasurements` tab leaves U:Y blank everywhere.
- **SyncLog** (A:N) — one row per COROS sync run (luketmoss/thrive#156): run_id, started_at,
  finished_at, window_start, window_end, n_seen, n_new, n_updated, n_enriched,
  n_fit_fetched, n_errors, status (`ok`/`partial`/`failed`), error_detail,
  notes (luketmoss/thrive#155).
  Appended only by the COROS sync; the dead-man's switch
  (`thrive-coros-sync-watchdog.yml`) fails when the newest row is over 16 h old.
- **WithingsSyncLog** (A:N) — one row per Withings sync run (luketmoss/thrive#200), `SyncLog`'s
  layout exactly: `n_seen` is measure groups fetched, `n_new`/`n_updated` are
  `BodyMeasurements` rows, `n_enriched`/`n_fit_fetched` are always `0`, `notes`
  lists unattributed groups skipped. Appended only by `sync/withings-run.mjs`
  through `appendSyncLog` with `log: 'withings'`; `thrive-withings-sync-watchdog.yml`
  fails when the newest row is over 14 h old. A separate tab because `SyncLog`
  has no source column: nothing that reads `SyncLog` may ever see a Withings run.
- **Journal** (A:D) — one note per local date (luketmoss/thrive#233): date, note, created,
  updated. Written by the SPA through `frontend/src/api/journal-api.ts`; saving a
  blank note deletes the day's row. Row mapping mirrors `JOURNAL_FIELDS` in
  `apps-script/src/types.js` — change both together. Created by
  `scripts/migrate-233-journal-tab.mjs`. The API reaches it through `getJournal`
  (a date range, oldest first) and `upsertJournal` (`{date, note}`: create,
  replace in place keeping `created`, or a blank note deletes the row), both
  **key-only** (`apps-script/src/journal.js`, luketmoss/thrive#234; neither is on
  `TOKEN_READ_ACTIONS`: journal text is personal and nothing needs it by token).
  The MCP server exposes them as `thrive_journal` (default 30 days) and
  `thrive_set_journal_entry` (clearing an existing note is dry-run until
  `confirm: true`).
- **SyncRequests** (A:I) — on-demand sync requests (luketmoss/thrive#314, luketmoss/thrive#232's route c): one
  row per vendor per "Sync now" press. request_id, vendor, requested_at,
  requested_by, status, workflow_run_id, dispatched_at, finished_at, detail.
  The SPA only ever appends A–E (`sr_` + 8 hex, `coros`|`withings`, ISO UTC,
  the signed-in email or blank, `requested`; luketmoss/thrive#315). The one other appender is
  the poller itself: on the first tick in a slot's 15-minute window
  (`SYNC_SCHEDULE_SLOTS`: 6:30 AM and 6:30 PM daily, America/Denver) it adds
  one `coros` row with `requested_by` = `schedule` (once per slot per day, any
  status counts) and dispatches it that tick — GitHub's own cron is best-effort,
  a dispatch is not. The phone opens the COROS app at 6:15 (MacroDroid) and the
  daily brief / Sunday weekly brief run at 6:45. `pollSyncRequests`
  (`apps-script/src/sync-requests.js`), a 5-minute Apps Script time-driven
  trigger on the bot account, writes every later value in E–I and never
  deletes or writes A–D of a row it did not add. It dispatches the existing
  `thrive-coros-sync.yml`/`thrive-withings-sync.yml` (on `luketmoss/keel`) with a fixed `{"ref":"main"}` and the
  `GITHUB_DISPATCH_TOKEN` script property, and closes each row it started.
  Sync now does not wait for the next tick (luketmoss/thrive#410): once its rows are appended,
  the SPA POSTs `requestSync` (`request_ids` = the ids it just appended) with
  its Google access token, and the API runs the tick's own per-vendor step for
  those rows' vendors, under the same lock and rules, appending nothing. The
  token must come from the SPA's OAuth client (`TOKEN_CLIENT_ID` =
  `VITE_GOOGLE_CLIENT_ID`) and the owner's account (`TOKEN_ALLOWED_EMAIL`).
  Any failure of that call is silent: the row is there, the poller takes it.
  Statuses: `requested` → `started` → `done`|`cancelled`|`failed`|`not_reported`,
  or `requested` → `skipped`|`failed`|`expired`; all but `requested`/`started`
  are final and never touched again. `detail` is words, never the token or
  GitHub's body. A `workflow_dispatch-<workflow_run_id>-N` row in the vendor's
  log tab outranks the request's own status. Row mapping mirrors
  `SYNC_REQUEST_FIELDS`/`_STATUSES`/`_VENDORS` in `apps-script/src/types.js`
  and `frontend/src/api/sync-requests-api.ts` — change both together. Created
  by `scripts/migrate-314-sync-requests-tab.mjs`. Later columns are only ever
  appended.
  The Day view (luketmoss/thrive#409) shows "Synced <age>" (the older of COROS's and Withings's
  newest runs) with a Sync now control that shares `useSyncNow` with Settings;
  a request closing re-reads health, the sync logs and Workouts/Sets (held as
  `src/state/refresh-hold.ts` holds them).

`Created` on `Exercises`/`Workouts`/`Labels` is written but never read — a
deliberate forensic trail, not dead weight to be removed.

**Durations are stored in seconds** (`Workouts!H`), displayed and entered in
whole minutes. `frontend/src/api/duration.ts` is the only conversion boundary.
`Workouts!L-Q` are nullable activity attributes — empty means nobody said, and
no code path may default them to `0`. `Workouts!R-Z` are the sync provenance
columns, nullable for the same reason; a blank `source` positively means
"logged by hand", so nothing may default it to a vendor name.
A new synced activity completes the day's one matching plan instead of
appending beside it (luketmoss/thrive#403): `upsertSyncedWorkout` claims the single
`status = planned` row of the activity's `type` and `date` with `source` and
`source_activity_id` blank, keeps its name, notes, template, estimate and
effort, and finishes it. Two or more such plans claim nothing, and the run's
SyncLog notes name them.
`Workouts!AA` `estimated_seconds` (luketmoss/thrive#145) is how long a *planned* session is
meant to take, typed per plan in whole minutes and stored in seconds through
the same `duration.ts` boundary. It is not time taken: starting a plan never
copies it into `Elapsed (s)`, nothing sums it, and the sync never writes it.
It stays on the row after the workout starts, as the plan's record. Blank
means nobody estimated it; `0` is refused.
`Workouts!AB` `sport_type` (luketmoss/thrive#260) is the COROS sport code (e.g. `204`
mountain bike, `402` strength), digits stored as text. Nullable with R-Z's
provenance: blank means unknown (not a COROS row, or not yet backfilled),
never `0`. Sync-owned: written by `upsertSyncedWorkout`/`enrichWorkout` and
overwritten whenever the sync sends it, left alone when it does not; the SPA
never sets it and the user cannot edit it. The SPA builds the "View on COROS"
portal link from it and `source_activity_id` (`frontend/src/api/coros-link.ts`).
Added by `scripts/migrate-260-workouts-sport-type.mjs`; rows synced earlier
were filled by `scripts/backfill-260-workouts-sport-type.mjs`.

### Workout Types
- `weight` — structured weight training with exercises, sets, reps, effort
- `stretch` — notes + date only
- `bike` — notes + date only
- `hike` — notes + date only

### Template Sections
Exercises in templates are tagged with sections: `warmup`, `primary`, `SS1`, `SS2`, `SS3`, `burnout`, `cooldown`. Superset exercises share the same `SS*` tag.

### Effort Scale
Three levels: `Easy`, `Medium`, `Hard`

### Exercise Tags
Comma-separated, multiple per exercise. Common tags: Push, Pull, Legs, Chest, Back, Shoulders, Arms, Core, Compound, Isolation.

## UX Design Decisions
These decisions were made with the user and must be respected by all agents:

- **Landing screen**: the Day view (luketmoss/thrive#228, decided 27 Sep 2026; luketmoss/thrive#235 records the navigation; luketmoss/thrive#237 built the screen).
- **Set logging**: Logbook-style — record sets when convenient, not real-time per-set
- **Rest timers**: None in-app — rest times are planning data only (user uses watch)
- **Supersets**: Flat list with section labels/colors (not grouped flow)
- **Start workout**: Choose [From Template] or [Build Custom]
- **Exercise library**: Inline creation (on-the-fly during workout/template building)
- **Set entry**: Quick-fill weight for all sets, override individual sets if different
- **Templates**: Create via dedicated editor AND save-from-workout
- **Navigation**: Bottom tab bar (Day | Activities | Trends | Library | Settings); Library = Templates + Exercises
- **Activity cards**: Compact (Date, Name, Type badge) — tap to view details
- **Activity detail**: Summary per exercise, tap to expand set-by-set
- **Copy workout**: Pre-fill from previous + show "last time" reference while logging
- **Device**: Mobile-first (375px primary breakpoint)

## Preview and demo mode

The app needs Google OAuth. For previews, use **demo mode**: a fake user, no
Google sign-in, nothing persisted.

- **Desktop:** start the root `.claude/launch.json` entry `thrive`
  (`preview_start`), then open `http://localhost:5175/?demo=true`.
- **Cloud sessions** have no preview pane: `node .keel/look.mjs thrive
  "/?demo=true"` from the repository root, per the web stack skill.
