# Thrive tools

Reference for the 28 `thrive_*` tools served at `/thrive/mcp`. Carried over from the
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
| `thrive_daily_summary` | `DailySummary` for a date range: the per-day rollup of activities, health, body and drinks (water in oz and ml, coffee in cups, alcohol in drinks; #522, #562). Derived, and its distance and ascent are **outdoor only** |
| `thrive_drinks` | Thrive Sip's water, coffee and alcohol log for a date range (default: today; at most 400 days): each entry with its local time, kind and amount, per-day totals (water in oz and ml with the % of the goal, coffee in cups, alcohol in drinks), the water goal, and over several days the average water on logged days and the total coffee and alcohol. Each entry ends with its id, which the drink tools under Repair take (#595) |
| `thrive_body_measurements` | Withings weight, body composition and blood pressure readings for a date range (default: the 30 days ending today), grouped by local date. Mass shown in kg and lb; filter by `kind` (`scale` / `bp`) |
| `thrive_journal` | The user's own journal for a date range (default: the 30 days ending today): one free-text note per day, oldest first, with days that have no note listed as having none |
| `thrive_list_exercises` | The exercise library, filterable by search text or tag |
| `thrive_list_templates` | Templates with their exercises, sections, sets and reps, and a section's rest and switch where the template sets one (#576) |
| `thrive_exercise_history` | Progression for one exercise over time — the tool for deciding whether to add weight or volume |

### Scheduling and authoring

| Tool | Description |
|------|-------------|
| `thrive_schedule_workout` | (Over 200 rows in the call it is previewed, not written, until `confirm: true`; see Write limits.) Create a workout with status `planned` for a future date, expanded from a template or an explicit exercise list. Exercise entries can prescribe a `weight` (every set) or `set_weights` (per set); the whole list is validated before anything is written. `estimated_min` (whole minutes) records the plan's estimated duration. `rest` sets the rest and switch times by section (see Rest times); the confirmation lists each timed section's resolved rest |
| `thrive_schedule_week` | (Same 200-row ceiling and `confirm`.) Schedule several workouts in one call, each shaped like a `thrive_schedule_workout` call, `rest` included and resolved per entry. All of them are validated first (any problem schedules none), then the sets are written, chunked if large, followed by the workouts |
| `thrive_create_exercise` | Add to the exercise library (refuses duplicate names unless overridden) |
| `thrive_create_template` | (Same 200-row ceiling and `confirm`.) Create a reusable template from an ordered exercise list, with an optional `rest` per section |

### Repair

| Tool | Description |
|------|-------------|
| `thrive_update_workout` | Fix date, name, type, notes, duration (`duration_min`, whole minutes), estimated duration (`estimated_min`), session effort, cardio attributes, or planned/completed status |
| `thrive_update_set` | Correct one logged set's weight, reps, planned reps or effort (pass `section` when a lift appears twice) |
| `thrive_undo` | Undo one write made through the MCP connector, from Thrive's change log. No arguments lists the last 20 calls; a `call_id` previews; `confirm: true` restores, all or nothing (any row changed since refuses the whole call). The undo is itself a call, so it can be undone. A write tool; counts toward the write limits |
| `thrive_update_sets` | (Same 200-row ceiling and `confirm`.) Correct many sets of one workout in one call. All entries are validated first (any problem writes nothing), each request is atomic, and each updated set's resulting state is echoed |
| `thrive_update_exercise` | Rename or retag an exercise |
| `thrive_update_template` | Replace a template's exercise list wholesale. Each section keeps its stored rest unless `rest` names it; the dry run shows rest before and after |
| `thrive_set_workout_rest` | Change a planned or active workout's rest and switch times by section (`rest`, required): re-resolves the planned rest of each set in the named sections, leaves sets already done (reps or `set_s` logged) as they ran, refuses a completed workout. Dry-run until `confirm: true`; `thrive_undo` reverts it |
| `thrive_set_journal_entry` | Write the journal note for a day: a non-blank note is saved at once (a replaced note is quoted back); a blank note clears the day and is dry-run until `confirm: true` |
| `thrive_delete_workout` | Delete a workout and cascade to its sets |
| `thrive_delete_exercise` | Delete a library entry |
| `thrive_log_drink` | Log water, coffee or alcohol on today or an earlier day (#595): `kind`, water's `amount_oz` (whole US fl oz, 1-67, default 4; refused on coffee and alcohol, which are 1 per entry), `count` (1-10 separate entries, "3 beers"), `date` (default today; `yesterday`, `-2d` and the other relative forms) and `time` (`HH:MM` local; default now on today, 23:59 on an earlier day, as the Day view does). A date and time after now is refused. Each entry gets its own id and `source` `mcp`, all under one `call_id`, so one `thrive_undo` reverts the lot |
| `thrive_update_drink` | Change a drink's water `amount_oz`, its `time`, or both, by `id` (#595). The time stays on the drink's day; a value equal to the stored one sends nothing. Through the API's `updateDrinkAmount` and `updateDrinkTime` |
| `thrive_delete_drink` | Delete one drink by `id` (#595). Dry-run until `confirm: true`; `thrive_undo` brings it back with its id |

## Safety model

Destructive tools — `thrive_delete_workout`, `thrive_delete_exercise`,
`thrive_update_template`, `thrive_set_workout_rest`, `thrive_delete_drink` and clearing a day's note with
`thrive_set_journal_entry` — are **dry-run by default**. Called without `confirm: true`
they report exactly what they would change and write nothing. The preview is built from
API reads (for `thrive_set_workout_rest`, the API's own dry run of the same action), so
the API's delete, replace and rest actions only ever change data once confirmed:

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
  created. A failure partway says what already landed. A superset or burnout round is
  never split across chunks: the API resolves its switch and rest from the whole round.

### Rest times (#583)

`thrive_schedule_workout`, each entry of `thrive_schedule_week`, `thrive_create_template`,
`thrive_update_template` and `thrive_set_workout_rest` take the same `rest` parameter:

```
rest: [{ section: "primary", rest_s: 120 }, { section: "SS1", rest_s: 60, switch_s: 15 }]
```

- **Sections**: `primary`, `SS1`, `SS2`, `SS3` and `burnout`. Warmup and cooldown have no
  rest. Each named section must be in the workout or template, and named once.
- **Values** are whole seconds. `rest_s` is 15–600: after every set of `primary`, and after
  each round of a superset or burnout. `switch_s` is 0–120, the pause between exercises
  within a round, and is refused on `primary`. These are the ranges of the Settings
  defaults (#576).
- **Left out** — a section, or one field of it — means "as it would be without `rest`".
  `null` means the Settings default.
- **Precedence when scheduling**: the entry's `rest`, then the template's section rest,
  then the Settings defaults. A schedule from an explicit exercise list has no template.
- **Templates**: the values are written on every row of the section. On
  `thrive_update_template` a section `rest` does not name keeps its stored values, and
  `null` clears one back to the default.
- **A planned workout**: `thrive_set_workout_rest` re-resolves `rest_target_s` for the
  named sections only, and only for sets not yet done (no reps and no `set_s`), so a
  workout in progress keeps the targets it ran against. It refuses a workout that is
  neither `planned` nor `active`, and is undone with `thrive_undo`.
- **The API resolves rest**, never this server: which set of a round takes the switch and
  which the rest is `resolveRestTargets` in `thrive/apps-script/src/sets.js`. The sets are
  sent before the workout row, so each `appendSets` carries the workout's template id and
  `rest` (`rest_plans`) for the API to resolve from. A refusal names the entry, the section
  and the problem, and nothing is written; in `thrive_schedule_week` one bad entry stops
  the whole call.

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
A synced workout's detail also says whether the sync has built a simplified GPS track for it
(`track_ref`, #432): `GPS track: stored in Drive (<id>)` or `GPS track: none`. The track itself is
not readable here either; the app draws it, and there is no tool that returns one.

### Approval on the destructive tools

Six tools destroy data and are dry-run until `confirm: true`:
`thrive_delete_workout`, `thrive_delete_exercise`, `thrive_update_template`
(it deletes the old rows), `thrive_set_workout_rest` (it overwrites planned rest),
`thrive_delete_drink` (#595) and `thrive_set_journal_entry` when it clears a note.
The dry-run only prevents accidents. Against prompt injection the control is a person
approving each call, and approval is stored **per device**: see "Approving the
destructive tools" in [../CLAUDE.md](../CLAUDE.md).

## Dates

Relative dates (`today`, `tomorrow`, `yesterday`, `+3d`, `-3d`; the last two #595) and a new workout's default time resolve
in **America/Denver**, the zone the rest of the code already treats as home. A Worker's
clock is UTC, so reading the machine's local time, as the stdio server did, would make
every evening's "today" tomorrow.
