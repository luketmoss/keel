# 767 — Thrive Spin: library, workout detail and builder

Part of #764. The prototype's "1 · Library", "2 · Workout" and "3 · Builder" artboards
(https://claude.ai/artifact/EXun1UbyRcgj1PfnhS7kq2), built on #766's shell
([766-spin-devices.md](766-spin-devices.md)) against #765's API and steps JSON v1. Starting the ride is #768: this
issue ends at handing it a `RideRequest` (§Hand-off to the ride engine).

No standing document exists in `thrive/docs/design/`. Tokens are the suite's (`ui/tokens/suite.css`), Thrive's
(`frontend/src/global.css`) and #766's Spin size tokens, mirrored into `SpinColors` and Spin's theme module by #766's
rule (`--space-*`/`--radius-*` in dp, `--text-*` in sp). The prototype's own hex values are not used.

## Shell and navigation

- **The app now opens on Library.** A bottom bar (`--nav-height`, `--color-surface`, 1dp `--color-border-light` top
  rule) holds three tabs: **Library | Build | Devices**, icon over label (`--text-xs`), the current one in
  `--color-primary-text` bold, the others `--color-text-secondary`. The prototype's **Rides** tab is not built: no
  child of #764 owns a list of rides (finished rides are in Thrive's Activities).
- The bar shows on Library and Devices only. Workout detail and the builder open full screen over it, with no bar.
- **Build** opens the builder on a new workout. Closing it (saved or discarded) returns to the tab it was opened
  from; saving shows the new workout's detail.
- Devices keeps its gear and Settings (#766). Library has no gear.
- Rotation and process death keep the screen, the library's filter and search text, the detail's intensity and mode
  for the open workout, and the builder's unsaved draft (all in saved state).

## Workout maths (plain Kotlin, JVM-tested)

One module, `core/workout/`, used by every screen here and by #768:

- **Parse and validate** steps JSON v1 with exactly #765's rules (keys, ranges, no nested repeats, 1–100 blocks,
  1–20 steps per repeat, repeat 2–50, total ≤ 21600 s, serialized ≤ 5000 characters). The builder's checks and the
  library's "couldn't be read" test are this validator; it never disagrees with the API.
- **Expand** a workout into `ResolvedStep`s, repeats unrolled in order: label, `durS`, mode, `pctStart`/`pctEnd`
  (equal unless a ramp), level, grade, cadence, and, given FTP and intensity, `wattsStart`/`wattsEnd`.
- **Watts** = FTP × pct × intensity ÷ 10000, rounded half up, for `erg` steps only. Intensity never changes a
  `resistance` level or a `slope` grade, and `free` has no target.
- **Planned estimates**, over `erg` steps only, with `p` = pct × intensity ÷ 10000:
  - TSS = Σ hours × mean(p²) × 100, where mean(p²) is p² for a flat step and (a² + ab + b²) ÷ 3 for a ramp a→b.
  - IF = √(TSS ÷ (total hours, every step) ÷ 100), two decimals.
  - Work = Σ seconds × FTP × mean(p) ÷ 1000 kJ, mean(p) = (a + b) ÷ 2 on a ramp. Needs FTP.
  - Rounding: TSS and kJ whole, half up; IF to two decimals, half up.
  - #765's example workout at FTP 250: **1 h 14 min, TSS 61, IF 0.70, 675 kJ**; at 105%: **TSS 67, IF 0.74, 709 kJ**.
    When any step is not `erg` the tiles carry the note "Estimated from the ERG steps."
- **Power zones** (Coggan, by the step's pct × intensity; a ramp by its mean): Z1 < 56, Z2 56–75, Z3 76–90,
  Z4 91–105, Z5 106–120, Z6 ≥ 121. Colours under §New tokens. Non-`erg` steps have no zone.
- **Durations**: a step is `m:ss` (`12:00`, `0:30`, `75:00`); a total is "45 min" under an hour, else "1 h 05 min" (minutes always two digits).

## The profile

Drawn the same at two sizes: `--spin-profile-sm` (library cards) and `--spin-profile-lg` (detail and builder).

- One bar per resolved step, its width proportional to its duration, `--space-xs`/2 (2dp) apart, corners
  `--radius-sm` at the top only.
- Height is the step's scaled pct over the chart's top, which is the larger of 130% and the highest scaled target
  plus 10%, so nothing clips at high intensity. A ramp is a trapezoid from start to end height.
- Colour is the step's zone token. `resistance`, `slope` and `free` steps are a flat bar at 40% height in
  `--color-border` (neutral: they have no power target).
- On the large size only: a 1dp dashed line in `--color-border-strong` at 100% (FTP × intensity is not drawn: the
  line is FTP itself), labelled at its right end "FTP 250 W" (`--text-xs` semibold, `--color-text-secondary`).
  With no FTP the line is labelled "FTP".
- Content description: "Profile: <n> steps, <total>".

## Library

```
Library
[🔍 Search 48 workouts                     ]
(All) (Endurance) (Sweet spot) (Threshold) (VO2) (Recovery)   ← scrolls sideways
┌ PLANNED TODAY · FROM THRIVE            › ┐
│ Sweet Spot 3×12                          │
│ ▁▂▅▅▂▅▅▂▅▅▁  profile                     │
│ 1 h 05 min   TSS 61   IF 0.70            │
└──────────────────────────────────────────┘
All workouts · 48
┌ Recovery Spin 30                  30 min ┐
│ ▂▂▂▂▂▂▂▂▂▂▂▂▂                             │
│ Recovery  TSS 20  IF 0.45  Ridden 9 days ago│
└──────────────────────────────────────────┘
```

- **Title** "Library", `--text-2xl` bold, as Devices' is. `--space-md` side margins; `--space-sm` between cards.
- **Search**: one field, `--tap-target` tall, `--radius-lg`, `--color-surface`, 1dp `--color-border`, a search icon
  in `--color-text-secondary`, placeholder "Search <n> workouts" (n = readable workouts). Matches, ignoring case and
  accents, any substring of the name or description. A clear button "×" (content description "Clear search") shows
  while there is text.
- **Category chips**: "All", "Endurance", "Sweet spot", "Threshold", "VO2", "Recovery". One is selected; selected is
  `--color-primary-fill` with `--color-on-fill` text, others `--color-surface` with 1dp `--color-border` and
  `--color-text`. `--radius-full`, `--tap-target` tall (the touch area; the drawn pill may be smaller). Search and
  chip combine (both must match).
- **Planned today**: for each row of `getPlannedWorkouts` for the phone's local date with `type = bike`,
  `status = planned` and a non-blank `ride_workout_id`, in `time` order, one card above the list, `--radius-lg`,
  `--color-primary-fill` ground, text `--color-on-fill`. Eyebrow "PLANNED TODAY · FROM THRIVE" (`--text-xs` bold),
  the workout's name (`--text-xl` bold), the small profile drawn in `--color-on-fill` at full opacity for Z4 and above
  and `--opacity-disabled` below, and "<total>   TSS <n>   IF <n.nn>". Tapping opens the workout's detail.
  - Its workout is not in the library (deleted, or not refreshed yet): the card shows the plan's own name and "This
    workout isn't in the library.", has no profile and no chevron, and is not tappable.
  - The planned card ignores search and chips. It is hidden when there is no such plan.
- **List heading**: "All workouts · <n>", or "<Category> · <n>", or with search text "<n> matching"
  (`--text-base` bold).
- **Sort**: shortest total first, then name (A–Z). No sort control.
- **Workout card**: `--color-surface`, 1dp `--color-border-light`, `--radius-lg`, `--space-md` padding. Name
  (`--text-base` bold) with the total at the right (`--text-sm` semibold, `--color-text-secondary`); the small
  profile; then one line (`--text-xs`): the category in `--color-primary-text` semibold, "TSS <n>", "IF <n.nn>" and
  the last-ridden text, in `--color-text-secondary`. TSS and IF are at 100% (neither depends on FTP). Tap opens
  detail. Content description "<name>, <category>, <total>, TSS <n>".
- **Last ridden** from `last_ridden_date`, against the phone's local date: "Never ridden", "Ridden today", "Ridden
  yesterday", "Ridden <n> days ago" (2–13), "Ridden <n> weeks ago" (14–59 days, n = days ÷ 7 rounded down), "Ridden
  <MMM d, yyyy>" (60 days or more).
- **Unreadable rows**: a row whose `steps` fails the v1 validator, or has another `v`, is left out of the list and
  the count. Below the list: "1 workout couldn't be read." or "<n> workouts couldn't be read." (`--text-xs`,
  `--color-text-secondary`). The MCP (#774) is where such a row gets fixed.

### Data, cache and refresh

- The library holds **one cache** in private storage: the `getRideWorkouts` rows, `getFtp`'s `current`, today's
  bike plans with the date they are for, and the time of the last successful refresh. A refresh replaces it whole,
  only when all three calls succeed.
- Library shows the cache at once, then refreshes in the background whenever the Library tab is shown (at most once
  a minute) and on pull-to-refresh. Cached plans are shown only if their date is today.
- A save or delete in the builder writes the returned row into the cache (or removes it) straight away.

| State | Shows |
|---|---|
| Not set up (no URL or key in Settings) | "Set up Spin first" (`--text-base` bold), "Add the API URL and key in Settings." and a filled button "Open settings" that opens #766's Settings |
| No cache, loading | a progress indicator and "Loading the library…" |
| No cache, refresh failed | "Couldn't load the library." and the reason (below), with a filled "Try again" |
| Cache, refreshing | the cache, with the pull-to-refresh indicator only when the person pulled |
| Cache, refresh failed | the cache, and under the title one line (`--text-xs`, `--color-text-secondary`): "Offline · library from <time>" for a network failure, else "Couldn't refresh · library from <time>". <time> is "h:mm a" today, else "MMM d". It goes on the next success |
| Empty library | "No workouts yet" and "Build one with the Build tab." |
| Nothing matches | "No workouts match." and a text button "Clear filters" that clears search and selects All |

Reasons (shared with the builder): network failure, timeout or a non-envelope body → "Can't reach Thrive."; "Invalid
or missing API key" or a code ending `_forbidden` → "Key rejected. Check the key in Settings."; any other
`success: false` → "Thrive answered with an error."

## Workout detail

```
[‹]                                    [Edit]
SWEET SPOT · PLANNED TODAY
Sweet Spot 3×12
Three 12-minute blocks just under threshold…
┌ profile, large, with FTP 250 W line ─────┐
┌ Intensity                 [−] 100% [+]   ┐
│ The whole workout, as written            │
│ [80%] [90%] [100%] [105%] [110%]         │
└──────────────────────────────────────────┘
[Time 1 h 14 min] [TSS 61] [IF 0.70] [Work 675 kJ]
Steps
  ■ Warm-up                10:00   50–70% · 125–175 W
  ┌ 3×  · 48 min ─────────────────────────────┐
  │ ■ Sweet spot   90 rpm  12:00   90% · 225 W │
  │ ■ Recover               4:00   55% · 138 W │
  └───────────────────────────────────────────┘
  ▬ Climb                   5:00   Slope 4.5%
  ▬ Spin                    5:00   Resistance 30
  ▬ Cool-down               6:00   Free
Trainer mode   [ERG | Resistance | Slope]
ERG holds the target power for you…
──────────────────────────────────────────
[▶ Start ride]
```

- **Top bar**: back arrow (content description "Back") and an "Edit" text button (`--color-primary-text`) that opens
  the builder on this workout.
- **Header**: eyebrow "<CATEGORY>", or "<CATEGORY> · PLANNED TODAY" when it is today's plan (`--text-xs` bold,
  `--color-primary-text`), name (`--text-2xl` bold), description (`--text-sm`, `--color-text-secondary`; hidden when
  blank).
- **Profile**, large, at the current intensity: it redraws as intensity changes.

### Intensity

The prototype's card. One setting for the whole workout.

- Default **100%**. It is set back to 100% each time a detail screen is opened from the library or the planned card
  (it survives rotation and process death while the screen is open). It never changes FTP or the saved workout.
- "−" (content description "Easier") and "+" ("Harder") change it by 1%, within **50–130%**; at a limit that button
  is disabled. Long-press repeats.
- Presets "80%", "90%", "100%", "105%", "110%": a radio group (accessible name "Intensity presets"); the one equal to
  the value is selected, none when the value is between presets.
- The value is `--text-lg` bold: `--color-text` at 100%, `--color-primary-text` below, `--color-warning` above.
- The hint (`--text-xs`, `--color-text-secondary`): "The whole workout, as written" at 100%, otherwise "The whole
  workout at <n>% · watts below are scaled".

### Tiles and steps

- Four tiles, equal width: "Time" (total), "TSS", "IF", "Work" ("<n> kJ", or "—" with no FTP), all at the current
  intensity. Under them, only when a step is not `erg`: "Estimated from the ERG steps." (`--text-xs`,
  `--color-text-secondary`).
- **Steps** card, rows at least `--tap-target` tall, 1dp `--color-border-light` between them. A row: a `--radius-sm`
  square in the step's zone colour (`--color-border` for non-`erg`), the label (`--text-sm` semibold), the cadence
  "<n> rpm" when set (`--text-xs`, `--color-text-secondary`), the duration, and the target at the right
  (`--text-sm` semibold):
  - `erg`: the template's % as written, then the scaled watts: "90% · 225 W"; a ramp "50–70% · 125–175 W". With no
    FTP, "90%" alone.
  - `resistance`: "Resistance 30". `slope`: "Slope 4.5%" (one decimal, "−2.0%" below zero). `free`: "Free".
- A repeat is drawn once, not unrolled: a group on `--color-primary-light` with `--radius-md` corners, headed
  "<n>× · <total of the group>" (`--text-xs` bold, `--color-primary-on-light`), its steps inside.
- Rows are not tappable.

### Trainer mode

- A segmented control "ERG | Resistance | Slope" (accessible name "Trainer mode"), shown only when the workout has
  at least one `erg` step. It chooses how the **`erg` steps** are ridden; `resistance`, `slope` and `free` steps run
  as written in every mode.
- Default **ERG** each time the screen opens. When #766's saved trainer features are known and lack ERG, ERG is
  disabled, the default is Resistance, and the hint is "Your trainer doesn't report ERG, so the targets are a guide."
- Hint under it (`--text-xs`, `--color-text-secondary`):
  - ERG: "ERG holds the target power for you, whatever your cadence or gear."
  - Resistance: "Resistance sets a fixed level. You hit the target by shifting and changing cadence."
  - Slope: "Slope makes it feel like riding a hill. The target shows as a guide."
- What level or grade the trainer gets in Resistance or Slope, and how the rider changes it, is #768's.

### Start

A footer bar (`--color-surface`, 1dp `--color-border-light` top rule) with one filled button, full width,
`--spin-cta-height`, `--radius-lg`, `--color-primary-fill`, a play icon and "Start ride", or "Start at <n>%" when
intensity is not 100%.

- **No FTP** (`getFtp` `current` null, or never fetched): the button is disabled (`--opacity-disabled`) and above it
  "No FTP yet. Ride the ramp test to set one." (`--text-xs`, `--color-text-secondary`). Watts show nowhere on the
  screen.
- Tapping builds the `RideRequest` and calls `RideStarter.start(request)`.

## Hand-off to the ride engine

#767 owns the request and the button; #768 owns what happens after.

```kotlin
data class RideRequest(
    val workoutId: String,          // RideWorkouts id; becomes the ride's ride_workout_id
    val workoutName: String,        // the ride's name
    val steps: StepsV1,             // parsed, as shown at the moment Start was tapped
    val intensityPct: Int,          // 50..130
    val mode: TrainerMode,          // Erg | Resistance | Slope
    val ftpW: Int,                  // the FTP the targets were shown at
)
interface RideStarter { fun start(request: RideRequest) }
```

- The request is a snapshot: a library refresh, an edit or a delete after Start changes nothing in it. Watts are not
  in it: the engine computes them from `steps`, `ftpW` and `intensityPct` with this issue's `core/workout/`
  functions, so the detail screen and the ride agree to the watt.
- #767 ships a `RideStarter` that shows a snackbar "Riding comes in a later update." and does nothing else. #768
  replaces that binding with its own; nothing in #767's screens changes when it does.
- Whether the trainer is connected, and what Start does when it isn't, is #768's.

## Builder

```
[×]  Workout name                         [Save]
     Sweet Spot 3×12                       [⋮]
[ error line, when any ]
┌ profile, large ───────────────────────────┐
1 h 14 min   TSS 61   IF 0.70   at FTP 250 W
Category  (Endurance)(Sweet spot)(Threshold)(VO2)(Recovery)
Description [                              ]
┌ ■ Warm-up              10:00   50–70% ─────┐  ← selected: 2dp --color-primary outline
┌ REPEAT 3×                 16 min each · 48 min ┐
│ ┌ ■ Sweet spot   12:00   90% · 225 W ┐       │
│ ┌ ■ Recover       4:00   55% · 138 W ┐       │
│ + Step in repeat                              │
└───────────────────────────────────────────────┘
[+ Step]                         [+ Repeat]
═══ editor panel, pinned to the bottom ═══
Sweet spot                          [Delete]
[ERG | Resistance | Slope | Free]
Duration [−] 12:00 [+]    Target % of FTP [−] 90% [+]
[ ] Ramp to …     [ ] Cadence target …
225 W at your current FTP. Targets are saved as a percentage, so they move when your FTP changes.
[Move up] [Move down]
```

### Header and details

- "×" (content description "Close builder"), the name field (label "Workout name", `--text-lg` bold, 1–80
  characters, counter shown from 70), "Save" (filled, `--tap-target`), and for an existing workout an overflow "⋮"
  (content description "More") with "Delete workout".
- Summary line under the profile (`--text-sm`): total, "TSS <n>", "IF <n.nn>" at 100%, and "at FTP <n> W", or "No
  FTP yet" without one.
- **Category**: the five chips (no "All"), single choice, none chosen on a new workout. **Description**: multi-line,
  0–1000 characters, placeholder "What it's for, and how to ride it".
- A new workout starts with an empty name, no category, and one step "Warm-up", 10:00, ERG 55%, selected.

### Blocks

- Each step is a row (`--spin-row-height`, `--radius-md`, `--color-surface`, 1dp `--color-border-light`; selected:
  2dp `--color-primary`): zone bar (`--space-xs` wide), label, duration, target in the detail's wording.
- A repeat is a box on `--color-primary-light`, `--radius-lg` (selected: 2dp `--color-primary` outline): a header
  button "REPEAT <n>×" with "<group> each · <group × n> total" at the right, its step rows, and a dashed text button
  "+ Step in repeat".
- Tapping a row or a repeat header selects it; one thing is selected at a time.
- "+ Step" (dashed 1dp `--color-primary`, `--radius-md`, `--tap-target`) appends "Endurance", 10:00, ERG 65% at the
  top level and selects it. "+ Repeat" appends a 4× repeat of "Work" 3:00 ERG 110% and "Recover" 3:00 ERG 50%, and
  selects the repeat. "+ Step in repeat" appends "Recover", 3:00, ERG 50% inside it and selects it.
- Limits are enforced at the buttons, not on Save: "+ Step" and "+ Repeat" are disabled at 100 top-level blocks;
  "+ Step in repeat" at 20 steps.

### Editor panel

Pinned above the keyboard, `--color-surface`, 1dp `--color-border-light` top rule, `--shadow-lg`. Title (the
selected step's label, or "Repeat block") at the left and "Delete" (`--color-danger-text`) at the right. With
nothing selected (after a delete that leaves nothing): "Add a step to start." and no controls.

**A step:**

- **Label** field (1–40 characters).
- **Mode**: segmented "ERG | Resistance | Slope | Free". Switching keeps label, duration and cadence and sets the new
  mode's default target: ERG 65%, Resistance 30, Slope 2.0%.
- **Duration**: −/+ by 0:30 below 5:00 and by 1:00 from 5:00, within 0:30–240:00. Tapping the value opens a
  "Duration" dialog with minutes and seconds fields (1 s to 240:00).
- **Target**, by mode:
  - ERG: "Target · % of FTP", −/+ by 5 within 0–300, tap to type. A "Ramp to" checkbox adds a second stepper
    "End %" (starts at the target + 20, capped at 300). Unchecking removes `pct_end`.
  - Resistance: "Level", −/+ by 5 within 0–100. Slope: "Grade", −/+ by 0.5 within −10.0 to 20.0, shown with one
    decimal and "%". Free: no target, the line "Ride as you like. The trainer applies no resistance target."
- **Cadence target** checkbox; when checked, a stepper "rpm", −/+ by 5 within 40–150, default 90.
- Under an ERG target: "<w> W at your current FTP. Targets are saved as a percentage, so they move when your FTP
  changes." (a ramp "<a>–<b> W …"; no FTP: "Targets are saved as a percentage of FTP.").
- **Move up / Move down** (outlined, `--tap-target`), within the step's own list (top level, or its repeat); absent
  at the ends. A step never moves into or out of a repeat.
- **Delete** removes the step. Deleting a repeat's last step removes the repeat. Selection moves to the block before,
  else the one after, else nothing.

**A repeat:** "Times through" −/+ by 1 within 2–50; Move up / Move down among the top-level blocks; Delete removes
the repeat and its steps.

No confirm on any delete inside the builder: Close with Discard is the way back.

### Save

- Save runs the validator. The first problem shows in an error line under the header (`--text-sm`,
  `--color-danger-text`), the offending field or step is selected, and nothing is sent:

  | Problem | Text |
  |---|---|
  | blank name | "Give the workout a name." |
  | no category | "Pick a category." |
  | a step with a blank label | "Every step needs a name." |
  | total over 6 h | "A workout can be at most 6 hours." |
  | steps JSON over 5000 characters | "This workout has too many steps to save." |

- Otherwise "Save" becomes "Saving…", the builder is read-only, and one `saveRideWorkout` goes out with `name`,
  `category`, `description` and `steps`, and an `id`: the workout's own when editing, or for a new workout a UUID
  made **once** when the builder opened, so a retry after a timeout replaces rather than duplicates.
- **Success**: the returned row goes into the cache. A new workout replaces the builder with its detail screen; an
  edit returns to its detail, which shows the saved version.
- **Failure**: the builder stays open with everything as typed, and the error line reads "Couldn't save. <reason>"
  with a reason from §Data. A `bad_request` is "Couldn't save. Thrive refused this workout." (the validator should
  make it unreachable).
- Saving overwrites the server's row whatever it holds: an MCP edit made since the library last refreshed is lost.
  There is no conflict check.

### Offline: edits are refused, not queued

A save or delete needs Thrive to answer. Offline it fails as above, with the draft kept on screen (and in saved state
across process death) so it can be saved once back online. Nothing is queued.

Why: the library's home is Thrive, and the MCP edits the same rows (#774). A queued edit would be sent at some later
moment and silently replace whatever was saved in between, with nobody looking. Building a workout is something done
before a ride, not on the trainer, so refusing costs little. Riding offline is unaffected: the cache has everything
detail and Start need.

### Close and delete

- "×", back and the system back gesture close the builder. With no change since it opened, it closes at once.
  Otherwise a dialog "Discard changes?" with "Discard" (`--color-danger-text`) and "Keep editing".
- **Delete workout** (existing workouts, from "⋮"): a dialog "Delete <name>?" / "It's removed from Thrive's library.
  Rides and plans that used it keep their record." with "Delete" and "Cancel". It sends `deleteRideWorkout`
  (`deleted: true` or `false` both count as done), removes it from the cache and returns to Library. A failure shows
  "Couldn't delete. <reason>" in the error line and leaves everything as it was.

## Copy

"Library", "Build", "Devices", "Search <n> workouts", "Clear search", "All", "Endurance", "Sweet spot", "Threshold",
"VO2", "Recovery", "PLANNED TODAY · FROM THRIVE", "This workout isn't in the library.", "All workouts · <n>",
"<Category> · <n>", "<n> matching", "TSS <n>", "IF <n.nn>", "Never ridden", "Ridden today", "Ridden yesterday",
"Ridden <n> days ago", "Ridden <n> weeks ago", "Ridden <MMM d, yyyy>", "1 workout couldn't be read.", "<n> workouts couldn't be
read.", "Set up Spin first", "Add the API URL and key in
Settings.", "Open settings", "Loading the library…", "Couldn't load the library.", "Try again", "Offline · library
from <time>", "Couldn't refresh · library from <time>", "No workouts yet", "Build one with the Build tab.", "No
workouts match.", "Clear filters", "Can't reach Thrive.", "Key rejected. Check the key in Settings.", "Thrive answered
with an error.", "Back", "Edit", "<CATEGORY> · PLANNED TODAY", "Intensity", "Easier", "Harder", "Intensity presets",
"The whole workout, as written", "The whole workout at <n>% · watts below are scaled", "Time", "TSS", "IF", "Work",
"<n> kJ", "Estimated from the ERG steps.", "Steps", "<n> rpm", "Resistance <n>", "Slope <n.n>%", "Free", "<n>× ·
<total>", "Trainer mode", "ERG", "Resistance", "Slope", "ERG holds the target power for you, whatever your cadence or
gear.", "Resistance sets a fixed level. You hit the target by shifting and changing cadence.", "Slope makes it feel
like riding a hill. The target shows as a guide.", "Your trainer doesn't report ERG, so the targets are a guide.",
"Start ride", "Start at <n>%", "No FTP yet. Ride the ramp test to set one.", "Riding comes in a later update.",
"FTP <n> W", "FTP", "Profile: <n> steps, <total>", "Close builder", "Workout name", "Save", "Saving…", "More",
"Delete workout", "at FTP <n> W", "No FTP yet", "Category", "Description", "What it's for, and how to ride it",
"REPEAT <n>×", "<group> each · <total> total", "+ Step", "+ Repeat", "+ Step in repeat", "Repeat block", "Delete",
"Add a step to start.", "Label", "Duration", "Target · % of FTP", "Ramp to", "End %", "Level", "Grade", "Ride as you
like. The trainer applies no resistance target.", "Cadence target", "rpm", "<w> W at your current FTP. Targets are
saved as a percentage, so they move when your FTP changes.", "Targets are saved as a percentage of FTP.", "Move up",
"Move down", "Times through", "Give the workout a name.", "Pick a category.", "Every step needs a name.", "A workout
can be at most 6 hours.", "This workout has too many steps to save.", "Couldn't save. <reason>", "Couldn't save.
Thrive refused this workout.", "Discard changes?", "Discard", "Keep editing", "Delete <name>?", "It's removed from
Thrive's library. Rides and plans that used it keep their record.", "Cancel", "Couldn't delete. <reason>".

## Accessibility

Every touch target is at least `--tap-target`. Icon-only buttons have content descriptions. Chips, presets, the
trainer mode and the builder's mode control are single-choice groups with accessible names. A step row reads "<label>,
<duration>, <target>". Zone colour is never the only carrier: every step's target is also text. Text meets 4.5:1 in
both themes with the tokens named; the planned card's `--color-on-fill` on `--color-primary-fill` is the suite's
filled-button pair.

## New tokens

Power zones, in `SpinColors` (Android only, not CSS). Thrive's web app has no power colours yet; #771 should take
these values for its time-in-zones chart rather than invent another set. They are graphics beside text that states
the same target, so they are not held to 3:1.

| Token | Light | Dark | For |
|---|---|---|---|
| `--zone-1` | `#8a93a8` | `#9aa3b5` | Z1, below 56% (active recovery) |
| `--zone-2` | `#4f86f7` | `#6e97ff` | Z2, 56–75% (endurance) |
| `--zone-3` | `#14a098` | `#2cc2b8` | Z3, 76–90% (tempo) |
| `--zone-4` | `#e8a317` | `#f2b84b` | Z4, 91–105% (threshold) |
| `--zone-5` | `#ee6a1f` | `#f58a4f` | Z5, 106–120% (VO2) |
| `--zone-6` | `#cf3a3a` | `#ef6b6b` | Z6, 121% and above (anaerobic) |

Sizes, in Spin's theme module beside #766's:

| Token | Value | For |
|---|---|---|
| `--spin-profile-sm` | 40dp | the profile on a library card and the planned card |
| `--spin-profile-lg` | 140dp | the profile on the detail screen and in the builder |
