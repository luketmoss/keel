# 356 — Training: the day's planned, done and missed workouts

Tokens are from the standing [design-language.md](design-language.md), the ones
#350, #351 and #353 added are in [350-foundation.md](350-foundation.md#new-tokens),
[351-day-screen.md](351-day-screen.md#new-tokens) and
[353-todo-panel.md](353-todo-panel.md#new-tokens), and the one this issue adds is
under [New tokens](#new-tokens). The spec is [../spec.md](../spec.md) (§1, §2,
§3, §5, §8). The behavioural reference is the prototype,
[../prototype.html](../prototype.html): `cardTraining()`, `actCard()`,
`plannedCard()`, `badge()`, and the `.acts`, `.act`, `.act-*`, `.badge`, `.eff`,
`.empty` and `.btn-outline` rules. Where the prototype and the design language
disagree, the design language wins, and this note says where that happened.

This note builds on four settled seams:

- **#350's data interface** — `getDataSource()`, the day-keyed reads, and the
  `Workout` shape. It adds one read and one shape; see
  [What this needs from #350 and #351](#what-this-needs-from-350-and-351).
- **#351's panel contract** — `slots.training`, `Panel`, `PanelAction`,
  `PanelNote`, `PanelStatus`, and a `useDayRead` that shares a call still in
  flight between hooks asking for the same read. Panels remount on every day
  change and whenever the layout crosses 960px.
- **#355's client** — `thriveConfigured()` and `callThrive<T>(action, params?)`,
  the `ApiError` kinds, and the mapping from a refusal onto a `DayRead`.
- **#353's row work** — `--row-min-h`, the `ext` and `plus` icons, and the
  "anything owned by Thrive or Hive opens there" treatment. Where the two panels
  do the same thing they do it the same way, and where they differ this note
  says why.

Nothing in this note exists yet to measure. See [Numbers](#numbers).

---

## Where it sits

`slots.training`, the second card on a phone and the first in the right column
from 960px (#351's layout). It renders the whole card on every day, and it is
the one panel whose title, chip and sub never change with the day state.

**One component.** `Training` in `src/panels/training/Training.tsx` holds both
hooks and renders the card in every day state. #353 needed two components
because its past and present ask different questions of Hive; this panel asks
Thrive the same two questions on every day and the day state only changes what
it does with the answer.

Today, on a phone:

```
┌──────────────────────────────────────────────┐
│ TRAINING  ● Thrive                   [+ Plan]│
│                                              │
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│ │ PLANNED  WEIGHT                        ↗ │ │
│ │ Upper Push A                             │ │
│ │ 6 exercises · 21 sets · about 45 min     │ │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ WALK · OUTDOOR                   1:30 PM │ │
│ │ Walk                                   ↗ │ │
│ │ 1.9 mi   36 min moving   140 ft up       │ │
│ │ ♥ 94 avg   Easy                          │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

A past day, with one activity and one plan that never happened:

```
┌──────────────────────────────────────────────┐
│ TRAINING  ● Thrive                           │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ BIKE · MOUNTAIN                  8:10 AM │ │
│ │ Mountain Bike                          ↗ │ │
│ │ 9.4 mi   1h 12m moving   1,180 ft up     │ │
│ │ ♥ 141 avg   Medium                       │ │
│ └──────────────────────────────────────────┘ │
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│ │ PLANNED · NOT DONE  STRETCH            ↗ │ │
│ │ Stretch                                  │ │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
└──────────────────────────────────────────────┘
```

## The three day states

| | Past | Today | Future |
|---|---|---|---|
| Title | **Training** | **Training** | **Training** |
| Chip | Thrive | Thrive | Thrive |
| Sub | none | none | none |
| Header action | none | **Plan**, when the card has a workout | **Plan**, when the card has a workout |
| Body order | done, then missed | planned, then done | planned, then done |
| Reads | `readWorkouts(date, date)` and `readWorkoutPlans(date, date)` | the same | the same |

The title, the chip and the absence of a sub are #351's table, unchanged. The
reads are the same three times over: the day state decides the order, the
badges and the empty wording, and nothing else.

**Why the order flips.** A past day is a record and reads chronologically —
what happened, then what didn't. Today and a future day are a plan, and spec §1
calls the app a morning driver, so what is still ahead comes first. It is the
prototype's ordering, and the reason is worth writing down because the two
orders look arbitrary side by side.

**Order inside each group.** Done workouts go by start time, earliest first,
with any that have no time after them. Planned workouts keep the order Thrive
returned them in, which is sheet order and so the order they were created;
there is no time to sort them by, and inventing one would make two plans swap
places between renders.

---

## A done workout

```
┌──────────────────────────────────────────────┐
│ BIKE · MOUNTAIN                      8:10 AM │
│ Mountain Bike                              ↗ │
│ 9.4 mi   1h 12m moving   1,180 ft up         │
│ ♥ 141 avg   Medium                           │
└──────────────────────────────────────────────┘
```

An `a`, the whole card, at least `--row-min-h` tall, `--space-sm` padding all
round, `--color-surface`, a 1px `--color-border` border and `--radius-md`. Two
columns: everything above, and an auto column holding the out-arrow, centred.
`--color-primary` border on hover, `--focus-ring` on focus.

Activities are cards rather than hairline-separated rows. That is the design
language's own exception — "Inside a card, rows are separated by hairlines, not
nested cards. The exception is Thrive activities, which are cards so a planned
workout can wear Thrive's dashed border."

- **Badge row**, wrapping, `--space-xs` between items: the type badge, then the
  start time pushed to the right.
- **Name**, `--text-base`, weight 650 (the prototype's `.act-name`),
  `--color-text`, wrapping on any character so a long unbroken name cannot push
  the card sideways.
- **Meta**, `--text-sm` in `--color-text-secondary` with `tabular-nums`,
  wrapping, `--space-xs` between lines and `--space-md` between items on a line.
  Each item is present only when its value is set.

### The type badge

Thrive's own `.type-badge` with its `.badge-<type>` colour, both copied into
`global.css` by #350, so a ride looks the same in both apps (design language,
§ Data colours). The words are the type's name and, when `sub_type` is set, a
"·" and the sub-type capitalised:

| `type` | `sub_type` | Badge |
|---|---|---|
| `bike` | `mountain` | BIKE · MOUNTAIN |
| `run` | `indoor` | RUN · INDOOR |
| `weight` | *(unset)* | WEIGHT |

The badge's own `text-transform: uppercase` does the upper-casing; the strings
in the source are "Bike", "Mountain" and so on. The badge always carries its
word, never colour alone (design language).

### The start time

`formatClock()` from #351's `src/day/format.ts`: 12-hour, Denver, no leading
zero — "8:10 AM", "1:30 PM". `--text-xs` in `--color-text-secondary`,
`tabular-nums`. A workout with no time shows nothing there and the badge sits
alone on the row.

### The meta line

In this order, each one only when its value is set:

| Item | Shown as | Notes |
|---|---|---|
| Distance | `9.4 mi`, or `9.4 mi (indoor)` | miles to one decimal place |
| Moving time | `1h 12m moving` | `36 min moving` under an hour |
| Elapsed time | `1h 12m` | only when there is no moving time, and with no word after it |
| Ascent | `1,180 ft up` | whole feet, grouped |
| Average HR | ♥ `141 avg` | the prototype's `heart` icon at `--icon-sm`, `--space-xs` before the number |
| Effort | `Medium` | last, in its colour |

- **Distance and ascent convert exactly as Thrive converts them** —
  `metersToMiles` and `metersToFeet` in `frontend/src/api/units.ts`: miles to
  one decimal place, feet rounded to the nearest ten and grouped with
  `toLocaleString('en-US')`. The same ride then reads the same number in both
  apps, which matters because tapping the card is how you get from one to the
  other.
- **"(indoor)" is the only sub-type the meta repeats**, because an indoor ride's
  distance came off a trainer and is not ground covered. The badge already
  carries the sub-type; this is the one place it changes how a number should be
  read.
- **Durations are whole minutes**, as everything in Thrive is
  (`frontend/src/api/duration.ts`): `1h 12m` at an hour or more, `36 min` below
  it. *A departure from the prototype*, which shows moving time as `1:12:30`.
  Seconds are detail for the activity's own screen, and this card is a summary
  by decision (issue body, 21 September).
- **The heart is decorative** and `aria-hidden`; a visually hidden "average
  heart rate" gives the number its meaning, so it is heard as "141 average
  heart rate".

### Effort

The word itself, weight 700, in its colour (design language, § Status):

| Effort | Colour |
|---|---|
| Easy | `--color-success` |
| Medium | `--color-warning` |
| Hard | `--color-danger` |

Unset: **"Effort not set"** in `--color-text-muted`. Not a dash, not a blank,
and never a middle value — this is the one field on the card that says out loud
that nobody said, because effort is the one the reader is most likely to go back
and fill in. Every other unset value is simply absent from the line.

The colour never carries the meaning on its own: the word *is* the value.

### The link

```
<VITE_THRIVE_APP_URL>#/history/<id>
```

Thrive's activity detail, which already exists (spec §8). **Same tab, no
`target`**, for #353's reasons: `sessionStorage` is per-tab and survives a
navigation, so coming back lands on the same day with the session intact, and on
a phone a new tab is the worse of the two. The out-arrow is the prototype's
`ext` at `--icon-sm` in `--color-text-muted`, `aria-hidden`, and a visually
hidden **"Opens in Thrive."** inside the link says where it goes.

---

## A planned workout

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│ PLANNED  WEIGHT                           ↗ │
│ Upper Push A                                │
│ 6 exercises · 21 sets · about 45 min        │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

The same card, with three differences: a `--planned-dash-w` **dashed**
`--color-border` border in place of the solid one, a `--color-surface-raised`
fill in place of `--color-surface`, and a state badge before the type badge. It
is unfinished-looking on purpose — the dashes say "not yet" before any word does
(design language, § Layout, which reserves the dashed border for exactly this).

### The state badge

Same shape as the type badge — `.type-badge`'s padding, radius, size, weight and
upper-casing — with its own colours and a `--planned-dash-w` dashed border so it
matches the card it sits on:

| When | String | Fill | Text and border |
|---|---|---|---|
| The date is today or later | Planned | `--color-primary-light` | `--color-primary` |
| The date is before today | Planned · not done | `--color-danger-tint` | `--color-overdue` |

"Planned · not done" is settled in the design language's § Words, and
`--color-overdue` is Hive's overdue red doing the same job here: a thing whose
day has gone. **Today is never missed** — the day is not over, and a plan you
have not started yet at 7am is not a failure.

There is no other difference between a missed card and a planned one. The
prototype makes the same choice, and it is the right one: the card still opens
Thrive's editor, where the answer is to move it or delete it.

### The meta line

One sentence at `--text-sm` in `--color-text-secondary`, its parts joined by
" · ":

- **`6 exercises · 21 sets`** — from `readWorkoutPlans`, for a strength workout
  only. Singular at one: "1 exercise", "1 set".
- **`about 45 min`** — from `Workout.est_minutes`, for any type.

Each part appears only when it has a value, and the line is absent when neither
does. **Live, only the counts appear**: nothing in Thrive records how long a
planned session is meant to take — not `Workouts`, not `Templates`, not the
planner — so `est_minutes` is `null` in live mode and filled in demo mode.
[thrive#145](https://github.com/luketmoss/thrive/issues/145) is that field;
until it ships, the estimate is a demo-mode state, which is worth seeing because
it is what the card will look like.

**A plan with no slots shows no counts.** If `readWorkoutPlans` returns nothing
for a workout, or zero of each, the counts are left out. "0 exercises · 0 sets"
is not a shape, it is the absence of one, and the card's job is to tell you how
big the session is.

**The line's height is reserved.** The counts arrive on a second Apps Script
call, after the card has already rendered from the first (below), so the meta
line occupies one `--text-sm` line from the moment the card appears, empty until
they land. A card that grows a line under your thumb a second after you have
started reading it is worse than a line of white space.

**A failed plan read is silent.** No error line inside the card, no retry of its
own. The card is complete without the counts — badge, name and the link into
Thrive — and a second error message inside a card that loaded fine would say
that something is broken when the thing you came for is right there. The card's
own status comes from `readWorkouts` alone; see
[What a failure looks like](#what-a-failure-looks-like).

### The link

```
<VITE_THRIVE_APP_URL>#/history/<id>/edit
```

Thrive's planner opens on that workout, where it can be rescheduled or deleted
(spec §5 — `workout-edit.tsx` branches on `isPlanned` and this route already
works). The visually hidden suffix is **"Planned — opens in Thrive's editor."**,
so the difference from a done card is heard as well as seen.

Editing a plan in Thrive **replaces the row**: `PlannedWorkoutEditor` deletes
the workout and creates a new one, so the id changes. That costs almanac
nothing — the next read brings the new id with it — but it is why the counts
cannot come from the workout's `template_id`, which the same code deliberately
does not carry over.

---

## The header action: Plan

A `PanelAction` (#351) on today and a future day, when the card has at least one
workout: the prototype's `plus` icon at `--icon-sm` and the word **Plan**. A
past day has none — you cannot plan a session for a day that has gone.

```
<VITE_THRIVE_APP_URL>#/workout/new
```

**No date, on purpose, and this is where #353 and this panel part company.**
#353 sends Hive's unshipped `?new=1&due=<date>` link today, because Hive's
frontend reads `board`, `view` and `item` and ignores everything else, so the
link opens the board until [hive#263](https://github.com/luketmoss/hive/issues/263)
lands and the create screen after. Thrive has no such tolerance:
`frontend/src/router/router.tsx` matches `/workout/new` **exactly**, and
`#/workout/new?plan=2026-09-25` is caught one line later by `/workout/:id` as an
active workout with the id `new?plan=2026-09-25`. `WorkoutFlow` finds no such
workout and calls `navigate('/')`, so the tap lands on Thrive's Activities
screen. The plain link opens the new-workout flow, which is the fallback the
issue asks for and strictly better than the parameterised one.

[thrive#143](https://github.com/luketmoss/thrive/issues/143) is the dated link.
When it ships, one helper changes — **`planHref()` in
`src/panels/training/links.ts`**, which is the only place either the header
action or the empty state's button builds this URL. #361 is that follow-up, and
it exists because the swap cannot be written now.

With `VITE_THRIVE_APP_URL` empty the action is not rendered.

---

## Empty

"Empty" means no workouts at all for the date — not a failed read, which is an
error, and not a read that came back with nothing, which is `ready` (#351).

| Day | Body |
|---|---|
| Past | One `PanelNote`, no icon: **"No activities."** |
| Today | **"Nothing planned today."** and a **Plan in Thrive** button |
| Future | **"Nothing planned."** and the same button |

The words and the button sit on one row with `PanelNote`'s padding —
`--space-xs` on top, `--space-md` at the sides and bottom — the words at
`--text-sm` in `--color-text-secondary`, the button pushed to the right,
wrapping under them when the card is too narrow.

**Plan in Thrive** is an outline button (the prototype's `.btn-outline`): a 1px
`--color-border` border, `--color-surface` fill, the `plus` icon at `--icon-sm`
and the label at `--text-sm` weight 600 in `--color-text`, `--radius-md`,
`--space-md` padding at the sides, at least 40px tall, with the border and label
turning `--color-primary` on hover. It goes to `planHref()`.

**When the card is empty the header has no action.** The body's button says
where the action goes and has room to; two identical controls in one small card
is worse than one in the right place. *This is deliberately not what #353 does*
— its **Add** stays in the header on an empty day — and the difference is that
#353's empty state is one sentence with nowhere to put a button, while this one
was designed around it in the prototype.

A past day whose only workout is a missed plan is **not empty**: it shows that
card. A day with something done and nothing planned is not empty either, and
keeps its header action.

---

## Reading Thrive

### The two reads

Both are `DataSource` methods (#350), attached in `src/data/live.ts` only when
`thriveConfigured()` is true, and both live in **`src/data/liveThrive.ts`** — a
new file this issue owns, holding Thrive's row types, the mapping and the two
live reads, exactly as #353 put Hive's in `liveHive.ts`. `live.ts`'s whole diff
is importing them and attaching them. The panel reads only through
`getDataSource()` and never calls `callThrive` itself.

| Read | Signature | Keyed by | Calls |
|---|---|---|---|
| `readWorkouts` | `(from: IsoDate, to: IsoDate)` | `Workouts!B`, the local calendar date | `getWorkouts({ from, to })` — **one, for any range** |
| `readWorkoutPlans` | `(from: IsoDate, to: IsoDate)` | the same | `getWorkouts({ from, to, status: 'planned' })`, then one `getWorkoutSets({ workout_id })` per planned **weight** workout |

Both actions are on thrive#144's allow-list for a token caller, so nothing here
needs a capability that issue does not already give.

**`readWorkouts` must stay one call.** #351's week strip reads it over a week
and #358's calendar will read it over a month, so its cost cannot scale with
what is in the range. That is the whole reason the plan detail is a second
method instead of extra fields on `Workout`: folding the set reads into
`readWorkouts` would make the strip pay a call per planned session in the week
and the calendar a call per planned session in the month, for counts neither of
them shows.

**Only this panel calls `readWorkoutPlans`, and only over its own date.** The
panel asks for both reads unconditionally, with its date as both bounds, so the
two calls go out together and the card has one status to show rather than two
waits in series. The cost is one Apps Script execution on a day with nothing
planned, where the answer is an empty map. That is the price of asking both
questions at once, and it is the right way round: the day that matters — today,
with a session planned — is the one that would otherwise wait twice.

thrive#146 would make `getPlannedWorkouts` return the counts itself, which turns
the plan read into one call and removes the redundancy with `readWorkouts`.
Nothing here waits for it, and this panel's shape does not change when it lands.

### Mapping a row

Thrive's API returns every cell as a **string**, with `''` for unset —
`cell()` in `apps-script/src/utils.js`, and the discipline `Workouts!L–Q` exists
for. Both of Thrive's writers store cells as text (the SPA with
`valueInputOption=RAW`, the API with `asText()`), so a display value is the
string that was stored, with no locale formatting in it.

`ThriveWorkoutRow` in `liveThrive.ts` types the fields this panel uses, all as
`string`. `toWorkout(row)` maps one row into #350's `Workout`:

1. **Numbers** — `elapsed_seconds`, `moving_seconds`, `distance_m`, `ascent_m`,
   `avg_hr`, `calories`. Trimmed, then `Number(...)`: `''` becomes `null`, a
   value that is not finite becomes `null`, and a genuine `0` stays `0`. This is
   Thrive's own `parse()` (`frontend/src/api/units.ts`), and it is the whole of
   "blank is not zero" on this side.
2. **`status`** — `'planned'` maps to `'planned'`; `''`, `'active'` and
   `'complete'` all map to `'complete'`. #351's week strip depends on those two
   values and this issue keeps them. `'active'` is a workout being tracked right
   now (`startWorkout` writes it, `finishWorkout` clears it), so it is already
   under way, not planned — it shows as a done card with its start time and
   whatever it has so far, and becomes an ordinary one the moment you finish it
   in Thrive.
3. **`effort`** — `'Easy'`, `'Medium'` or `'Hard'`; anything else, including
   `''`, is `null`.
4. **`sub_type`** — `'mountain'`, `'gravel'`, `'indoor'` or `'outdoor'`;
   anything else, including `''`, is `null`. An unrecognised value is dropped
   rather than shown, because the badge would print a word Thrive's own write
   path refuses (`SUB_TYPES` in `apps-script/src/types.js`).
5. **`time`** — kept as `'HH:MM'`. Anything that is not that shape is `null`.
6. **`name`** — used as it is; an empty one falls back to the type's own word
   ("Bike"), so a hand-added row still says what it was.
7. **`exercise_count`, `set_count`, `sets_logged`, `est_minutes`** — `null`.
   They are #350's demo-first fields; live, the counts come from
   `readWorkoutPlans` and the estimate from thrive#145.

**Two kinds of row are dropped**, with one dev-only warning naming the count and
nothing in a production build — #353's rule 2, applied to a different table:

- a row whose `date` is not a real `YYYY-MM-DD`, because it cannot be keyed by
  day;
- a row whose `type` is not one of Thrive's six, because every downstream
  consumer — this badge, #351's marks, #358's icons — is built on that set, and
  Thrive's own UI has no class for it either. Thrive validates `type` on every
  write, so such a row can only come from editing the sheet by hand.

**A row with an empty `id` is kept and rendered without a link**, since there is
nothing to open. Losing an activity that happened is worse than losing its link.

Rows are then keyed by `date` into a `Map<IsoDate, Workout[]>`, with no key at
all for a date with nothing (#350).

### Mapping the plan

`readWorkoutPlans` takes the planned rows, keeps the `weight` ones, and calls
`getWorkoutSets({ workout_id })` for each. That action returns one entry per
exercise **slot**, each with its sets (`groupSetsByExercise` in
`apps-script/src/sets.js`), so:

- `exercise_count` is the number of slots. The same exercise in two sections is
  two slots, which is the identity Thrive's own `slotKey` encodes — a warmup
  bench and a primary bench are two things you do.
- `set_count` is the total number of set rows across them.

Each becomes a `WorkoutPlan` — `{ workout_id, exercise_count, set_count }` —
keyed by its workout's date. A planned workout that is not `weight`, and one
whose sets read fails, simply has no entry; the card then shows no counts.

**One slow call must not lose the others.** The set reads go out together and
are settled individually: a workout whose read failed has no entry, and the rest
are returned. The read as a whole only fails when the planned-workouts call
itself does.

### What it costs

| Day | Calls |
|---|---|
| A past day with no plan | 2 — `getWorkouts` and the planned `getWorkouts`, in parallel |
| A past day with a missed strength plan | 3 |
| Today with one strength session planned | 3 |
| Today with nothing planned | 2 |

At a second or more per Apps Script call (implementation-plan.md § Risks) and 60
Sheets reads a minute (#351), this is the panel's share of a day view that also
carries #352's entry, #353's Hive reads, #357's health and the week strip.
thrive#146 takes the middle column down by one on every day.

### What a failure looks like

Straight from #355 and #351, with `source` as the string **"Thrive"**:

| Cause | `DayRead` | The card shows |
|---|---|---|
| `VITE_THRIVE_API_URL` empty → the method is never attached | `not-connected` | "Thrive isn't connected yet." |
| The session expired, or `code: 'token_invalid'` | `session-expired` | "Reconnect to load this." |
| `token_forbidden`, `read_only`, `token_unavailable`, any other `success: false` | `error` | "Couldn't load from Thrive." · Try again |
| `fetch` rejected with `navigator.onLine` false | `error`, `offline` | "You're offline — couldn't load from Thrive." · Try again |
| Non-200, non-JSON after one retry, or 20s | `error` | "Couldn't load from Thrive." · Try again |

**`readWorkouts` is the card's status; `readWorkoutPlans` never is.** While
`readWorkouts` is anything but `ready`, the body is `PanelStatus` and nothing
else. Once it is `ready`, the cards render, and the plan read only fills or does
not fill one line inside them.

**Until thrive#144 ships**, a live request carrying an access token and no `key`
is refused by Thrive's current `validateApiKey`, which lands as `error` —
"Couldn't load from Thrive." with Try again. That is the correct thing to show:
the source is connected and is saying no. Demo mode meanwhile shows all three
day states in full, so the panel can be built, tested and merged before the
token check exists, exactly as #353 merges before hive#264.

**Never an empty day on a failure.** An empty result is `ready` and says
"Nothing planned today."; a refusal says it could not load. #350's rule that
absent means "not connected", never an empty day, is the same rule one level up.

### What this needs from #350 and #351

One new read, one new shape, and one name added to a union. Nothing existing
changes.

- **#350, `src/data/types.ts`:** add
  `WorkoutPlan { workout_id: string; exercise_count: number; set_count: number }`.
  `Workout` is untouched — its `exercise_count`, `set_count` and `est_minutes`
  keep the meaning #350 gave them, and the demo `readWorkoutPlans` reads the
  first two straight off the generated workouts. `sets_logged` stays and is
  unused by this panel; the done card's contents were decided without a sets
  count.
- **#350, `src/data/source.ts`:** add
  `readWorkoutPlans?(from: IsoDate, to: IsoDate): Promise<Map<IsoDate, WorkoutPlan[]>>`,
  optional like the other reads, with dates at both ends — `readHiveDue` remains
  the only read with a nullable lower bound.
- **#350, `src/data/demo/`:** implement it from the generated data, so demo mode
  has seven reads rather than six.
- **#351, `src/day/useDayRead.ts`:** `'readWorkoutPlans'` joins the names the
  hook accepts. Its key, its sharing, its statuses and its refresh behaviour are
  unchanged.

### Environment

`VITE_THRIVE_APP_URL` becomes real here, the way #353 made `VITE_HIVE_APP_URL`
real: `https://luketmoss.github.io/thrive/` — Thrive's Pages base, which its own
`vite.config.ts` pins — described in `almanac/.env.example`, and passed to the
build by `.github/workflows/almanac-pages.yml` from a new repo secret
`ALMANAC_THRIVE_APP_URL`. The hash is appended to it as given, so the trailing
slash belongs in the value.

Empty is a supported state, not a misconfiguration: every activity renders as a
non-interactive block with no out-arrow, and neither **Plan** nor **Plan in
Thrive** is rendered.

---

## What #358 and #359 can reuse

- **`readWorkouts` over a range is one call**, and the map is already day-keyed,
  so a month is one call and a year is one call. #358's day summary and #359's
  training-time bars both read it.
- **The type badge and the effort colours** are this panel's components in
  `src/panels/training/`, and both are pure functions of a `Workout`. #358 uses
  icons rather than badges for workout types (design language, § Data colours),
  so it wants the type's *word* and not this component.
- **`readWorkoutPlans` is not for them.** It costs a call per planned strength
  workout in its range, which is why nothing but the day's own card asks for it.
- **`getHistoryDateRange`** is the action that answers "how far back does Thrive
  go", and neither read here uses it. #359's "All" range is what wants it.

---

## Edge cases

- **A planned workout you then did.** Thrive flips the same row from `planned`
  to `active` to done, so it moves from the top group to the bottom one and is
  never in both. Nothing here dedupes, because there is nothing to dedupe.
- **A workout in progress right now.** `status` is `'active'`: it shows as a
  done card, with its start time and no duration, and fills in when you finish
  it in Thrive. Coming back to the tab re-reads (#351), so it updates without a
  reload.
- **Midnight, with today on screen.** The `today` signal rolls over, the day
  state goes from today to past, the panel remounts, the order flips, an
  unstarted plan gains its "Planned · not done" badge, and the Plan action goes.
- **A done workout dated in the future.** Only possible by hand in Thrive. It is
  shown, after the planned ones, rather than hidden — the card lists what Thrive
  says, and a workout that vanished would be harder to find than one in an odd
  place.
- **A planned workout that is not strength.** Thrive's planner only offers the
  plan intent for strength today, but the sheet and the API allow any type. Such
  a card shows its badges, its name, and — live — no meta line at all, since the
  counts are strength's and the estimate does not exist yet.
- **A workout with nothing but a name.** Every activity column blank: the badge,
  the name, and "Effort not set". No dashes, no zeroes.
- **An indoor ride.** The badge reads BIKE · INDOOR and the distance reads
  "22.4 mi (indoor)", because that distance came off a trainer.
- **Two sessions in one day.** Two cards, in start-time order.
- **A very long workout name.** It wraps on any character, so the card grows
  taller rather than the panel growing wider.
- **`VITE_THRIVE_APP_URL` empty.** Cards render as blocks with no out-arrow and
  no link; the header action and the empty state's button are both absent. The
  panel still shows the day's training, which is most of its value.
- **Offline.** The card shows the offline line and Try again; every other card
  does the same at the same moment, which is why #351 does not make it an alert.
- **The session has ended.** "Reconnect to load this."; after Reconnect both
  reads run again by themselves (#351).
- **Swiping fast across days.** #351 drops answers for days you have left and
  rejoins calls still in flight; this panel adds nothing to that. Both of its
  reads take part.
- **Crossing 960px.** The panel remounts and asks for the same two keys, joining
  whatever is still in flight. Nothing is read twice.
- **Demo mode.** All three day states in full, including the missed plan three
  days ago that #350's generator places, the planned week ahead, and the
  estimated times. No request leaves the page.

---

## Copy

| Where | String |
|---|---|
| Card title | Training |
| Chip | Thrive |
| Header action | Plan |
| State badge, today or later | Planned |
| State badge, a past day | Planned · not done |
| Type badge | Bike · Mountain *(upper-cased by the badge)* |
| Start time | 8:10 AM |
| Distance | 9.4 mi · 22.4 mi (indoor) |
| Moving time | 1h 12m moving · 36 min moving |
| Elapsed time, with no moving time | 1h 12m · 36 min |
| Ascent | 1,180 ft up |
| Average HR | 141 avg |
| Average HR, heard | 141 average heart rate |
| Effort | Easy · Medium · Hard |
| Effort, unset | Effort not set |
| Plan meta, strength | 6 exercises · 21 sets |
| Plan meta, one of each | 1 exercise · 1 set |
| Plan meta, estimate | about 45 min |
| Done card, heard | …Opens in Thrive. |
| Planned card, heard | …Planned — opens in Thrive's editor. |
| Empty, today | Nothing planned today. |
| Empty, a future day | Nothing planned. |
| Empty, a past day | No activities. |
| Empty action | Plan in Thrive |
| Not connected | Thrive isn't connected yet. |
| Loading | Loading… |
| Error | Couldn't load from Thrive. |
| Error, offline | You're offline — couldn't load from Thrive. |
| Error action | Try again |
| Session ended | Reconnect to load this. |

The last five are #351's `PanelStatus` sentences with "Thrive" in them, not new
strings. Sentence case throughout, and nothing in the card is a verdict — it
lists the day's training and never rates it (spec §1).

---

## Numbers

almanac is still the scaffold #350 will replace: `almanac/src` holds
`main.tsx`, `App.tsx`, `App.test.tsx`, `test-setup.ts` and an empty
`components/`, so nothing in this note could be measured against a running app.
Every number is **unmeasured until built**, and each comes from a source:

| Number | Source |
|---|---|
| 48px minimum card height (`--row-min-h`) | #353's token, from the prototype's `.todo`; this note reuses it as #353 said it would |
| 1.5px dashed border | the prototype's `.act.planned`, `.badge.plan` and `.badge.miss`; Thrive's own `.badge-planned` uses the same width |
| Distance to one decimal place; ascent to the nearest 10 ft, grouped | Thrive's `metersToMiles` and `metersToFeet` (`frontend/src/api/units.ts`) |
| Durations in whole minutes | Thrive's `secondsToMinutes` (`frontend/src/api/duration.ts`); the "1h 12m" / "36 min" form is the prototype's `minsText()` |
| Rows at least 44px, touch targets at least 40px | design-language § Scale |
| The 960px two-column breakpoint | design-language § Layout; #351 renders it |
| 300ms before "Loading…" | #351 |
| 60 read requests a minute per user | the Google Sheets read quota, as #351, #352 and #353 cite it |
| A second or more per Apps Script call | implementation-plan.md § Risks |
| One call per planned strength workout | `getWorkoutSets` takes one `workout_id` (`apps-script/src/main.js`); thrive#146 is the change that would remove it |

`/test` checks the card height and the tap targets in the running app, in demo
mode, with `getBoundingClientRect()` at a 360px-wide viewport — the width #351
and #353 already check at.

---

## New tokens

The design language, #350, #351 and #353 have no token for this one. Its value
comes from the source named, and `global.css` defines it on `:root` like the
rest.

| Token | Value | For | Source |
|---|---|---|---|
| `--planned-dash-w` | `1.5px` | the dashed border a planned activity card and its state badge wear. One token because the two are the same line at two sizes, and a plan that half-matches itself is worse than either | prototype `.act.planned`, `.badge.plan`, `.badge.miss`; Thrive's `.badge-planned` |

**No new colours.** The Planned badge is `--color-primary-light` and
`--color-primary`, the Missed badge is `--color-danger-tint` (#350) and
`--color-overdue`, and the effort words are `--color-success`, `--color-warning`
and `--color-danger` — all of them already in the design language or #350's
note.

**One new icon**, `heart`, from the prototype's set, joining the `plus`, `ext`,
`check` and `info` that #353 brought in.

Sizes the prototype uses off the scale are brought onto it instead of getting
tokens, as #351 and #353 did: the activity card's 12px padding becomes
`--space-sm` inside a body that already has `--space-md` at the sides, which is
the prototype's 24px to the text; its 12px gap becomes `--space-sm`; the badge
row's 6px becomes `--space-xs`; the meta's `2px 12px` becomes `--space-xs` and
`--space-md`; the out-arrow's and heart's 16–18px become `--icon-sm`; and the
empty state's 36px button becomes the design language's 40px minimum.
