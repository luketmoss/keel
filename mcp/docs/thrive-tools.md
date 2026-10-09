# Thrive tools

Reference for the 22 `thrive_*` tools served at `/thrive/mcp`. Carried over from the
README of the stdio server this Worker replaced (luketmoss/keel#372); the tool
descriptions in `src/thrive/tools.js` are what an agent actually sees, and are the
source of truth. For the conventions an agent needs to use the data safely, see
[thrive-agent-brief.md](thrive-agent-brief.md).

## How it works

The tools are a **thin client of the Thrive Apps Script API** (`apps-script/` in
`luketmoss/thrive`), called with the Worker's own MCP-only key. They hold no row
mapping and never touch the sheet: `src/thrive/api.js` is the only file that talks to
the outside world, and it speaks in domain objects. A set is named by workout,
exercise, section, order and set number, never by row.

What lives here is everything that needs no sheet: tool definitions, narration of
results for the agent, schedule planning, and the per-entry checks whose wording agents
already rely on. **A change to Thrive's `apps-script/` that alters a response shape
needs a matching change here.**

## Tools

### Reading and analysis

| Tool | Description |
|------|-------------|
| `thrive_list_workouts` | Workouts newest first; filter by date range, type, planned/completed, name, and source (`synced` / `enriched` / `manual`). Shows the venue (`[bike:gravel]`) and marks COROS-synced and COROS-enriched rows |
| `thrive_get_workout` | One workout in full — every exercise, every set, its activity measurements, and its provenance: synced, enriched or hand-logged, with the COROS activity id, last sync, and whether the raw payload and FIT file are archived |
| `thrive_get_workout_payload` | A synced or enriched workout's archived COROS detail payload: COROS's own text, with what the sheet does not carry (max speed, training effect, and max HR or laps where COROS includes them). 20,000 characters per call; a longer one ends with the `offset` for the next page. Hand-logged workouts have none |
| `thrive_daily_health` | `DailyHealth` for a date range (default: the 7 days ending today): resting HR, HRV, average stress, steps, calories, sleep and its stages, sleep score, bed and wake time, VO2max, recovery, training load |
| `thrive_daily_summary` | `DailySummary` for a date range: the per-day rollup of activities and health. Derived, and its distance and ascent are **outdoor only** |
| `thrive_body_measurements` | Withings weight, body composition and blood pressure readings for a date range (default: the 30 days ending today), grouped by local date. Mass shown in kg and lb; filter by `kind` (`scale` / `bp`) |
| `thrive_journal` | The user's own journal for a date range (default: the 30 days ending today): one free-text note per day, oldest first, with days that have no note listed as having none |
| `thrive_list_exercises` | The exercise library, filterable by search text or tag |
| `thrive_list_templates` | Templates with their exercises, sections, sets and reps |
| `thrive_exercise_history` | Progression for one exercise over time — the tool for deciding whether to add weight or volume |

### Scheduling and authoring

| Tool | Description |
|------|-------------|
| `thrive_schedule_workout` | Create a workout with status `planned` for a future date, expanded from a template or an explicit exercise list. Exercise entries can prescribe a `weight` (every set) or `set_weights` (per set); the whole list is validated before anything is written. `estimated_min` (whole minutes) records the plan's estimated duration |
| `thrive_schedule_week` | Schedule several workouts in one call, each shaped like a `thrive_schedule_workout` call. All of them are validated first (any problem schedules none), then the sets are written, chunked if large, followed by the workouts |
| `thrive_create_exercise` | Add to the exercise library (refuses duplicate names unless overridden) |
| `thrive_create_template` | Create a reusable template from an ordered exercise list |

### Repair

| Tool | Description |
|------|-------------|
| `thrive_update_workout` | Fix date, name, type, notes, duration (`duration_min`, whole minutes), estimated duration (`estimated_min`), session effort, cardio attributes, or planned/completed status |
| `thrive_update_set` | Correct one logged set's weight, reps, planned reps or effort (pass `section` when a lift appears twice) |
| `thrive_update_sets` | Correct many sets of one workout in one call. All entries are validated first (any problem writes nothing), each request is atomic, and each updated set's resulting state is echoed |
| `thrive_update_exercise` | Rename or retag an exercise |
| `thrive_update_template` | Replace a template's exercise list wholesale |
| `thrive_set_journal_entry` | Write the journal note for a day: a non-blank note is saved at once (a replaced note is quoted back); a blank note clears the day and is dry-run until `confirm: true` |
| `thrive_delete_workout` | Delete a workout and cascade to its sets |
| `thrive_delete_exercise` | Delete a library entry |

## Safety model

Destructive tools — `thrive_delete_workout`, `thrive_delete_exercise`,
`thrive_update_template` and clearing a day's note with `thrive_set_journal_entry` —
are **dry-run by default**. Called without `confirm: true`
they report exactly what they would change and write nothing. The preview is built from
API reads, so the API's delete and replace actions only ever run once confirmed:

```
DRY RUN — nothing deleted. This would remove:
**Push A** — 2026-03-12 [weight] (w_1a2b3c4d)
- 14 set rows
  - Bench Press: 4 sets
  - Incline DB Press: 4 sets
  ...

Call again with confirm: true to delete.
```

`thrive_delete_exercise` adds a further gate: an exercise still referenced by sets or
templates needs `force_when_in_use: true`, since deleting it orphans that history.

More guardrails worth knowing:

- **Unknown fields are refused.** Every tool rejects a field its schema doesn't declare,
  naming it and listing the accepted ones, and writes nothing. Without this the SDK
  strips the field and a misnamed parameter becomes a silent no-op (#117).
- **Updates merge.** `thrive_update_workout` and `thrive_update_exercise` send only the
  fields passed; the API leaves every other column alone. A field is cleared by passing
  `""`, never by omitting it (#122).
- **Rename cascade.** Renaming an exercise rewrites the cached name in every Sets and
  Templates row, server-side and in the same call, so history doesn't fragment across
  old and new names. Template expansion writes the library's current name and refuses a
  template whose rows point at an exercise that no longer exists (#120).
- **Set targets are resolved, never guessed.** The API works out which row a set
  correction means. An exercise that appears twice in a workout (a warmup and a primary
  of the same lift) must be narrowed with `section` or `exercise_order`, and the error
  lists both candidates. A target matching nothing is refused rather than appended.
- **Stale-row protection** lives in the API: a bulk set update re-reads each target
  before writing and writes nothing if any moved (#95).

### Large batches

The API receives writes as a URL parameter, which caps a request's size. `api.js`
measures each write and splits one that would not fit:

- **`thrive_update_sets`** — a batch that fits is one atomic request. One that does not
  is previewed in full first, so an invalid entry anywhere still means nothing is
  written, then applied chunk by chunk, each chunk atomic. If a later chunk fails, the
  error names the entries earlier chunks already wrote.
- **`thrive_schedule_week`** — set rows are chunked the same way, then the workouts are
  created. A failure partway says what already landed.

### Synced data, and what an agent cannot see (#158)

The COROS sync (`sync/`) writes activities into `Workouts` and a row per day into
`DailyHealth`, and rebuilds `DailySummary` from both. Every one of those values is
nullable: a blank means COROS did not say, never zero, and the tools print it as `—` or
leave the line out rather than as `0`. Two caveats are repeated in the tool descriptions
because they are easy to get wrong in analysis:

- `DailySummary`'s distance and ascent are **outdoor only**, so they will not equal the sum
  of a day's activity distances on any day with an indoor session.
- `DailyHealth.steps` includes steps taken during indoor walks and runs. It is context,
  never an addend to activity distance or calories (`docs/data-architecture.md` §5).

The raw COROS payload (`raw_ref`) and FIT file (`fit_ref`) live in the sync bot's Drive.
This server has no Drive credential. `thrive_get_workout_payload` reads the payload through
the API's `getWorkoutPayload`, which runs as the bot and finds the file from the workout row
(#179). The FIT file's contents are not readable: it is binary and holds the GPS track.

### Approval on the destructive tools

Four tools destroy data and are dry-run until `confirm: true`:
`thrive_delete_workout`, `thrive_delete_exercise`, `thrive_update_template`
(it deletes the old rows) and `thrive_set_journal_entry` when it clears a note.
The dry-run only prevents accidents. Against prompt injection the control is a person
approving each call, and approval is stored **per device**: see "Approving the
destructive tools" in [../CLAUDE.md](../CLAUDE.md).

## Dates

Relative dates (`today`, `tomorrow`, `+3d`) and a new workout's default time resolve
in **America/Denver**, the zone the rest of the code already treats as home. A Worker's
clock is UTC, so reading the machine's local time, as the stdio server did, would make
every evening's "today" tomorrow.
