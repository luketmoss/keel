# 772 — FTP in Trends, and Spin workouts in bike plans

Part of #764 (Thrive Spin). Two surfaces: **Fitness** in Trends gains FTP, and
a bike workout can be **planned** in the app, optionally naming a Spin workout.
Data comes from #765's tabs: `FtpHistory` (A:F) and `RideWorkouts` (A:H), read
by the SPA straight from the Sheet with the user's token, and `Workouts!AL`
(`ride_workout_id`) for the link.

Standing documents this answers to: `ui/docs/design/keel-wide-rules.md` and
`ui/docs/design/suite-language.md` (charts show and never conclude; blank is
not zero; blank days break the line; never colour alone; 44px targets; all six
interaction states). Notes this builds on: `503-trends-icon-toolbar.md`,
`521-trends-drinks.md` (a metric added to an existing group, the same way),
`404-interaction-states.md`, `489-day-training-card.md` (the planned card).

The prototype (`Thrive · FTP in Trends`, `Thrive · Day with a planned ride`)
is the intent, not the layout. Four things in it are **not** carried, each for
a reason given where it comes up: the W / W·kg toggle, the "+37 W since
January" delta, the "Plan a retest" card, and the "tapping it opens Spin" line.

## Measured first

From the running app in demo mode (`/?demo=true`), `getBoundingClientRect()`
(width × height, px). The unnamed rows are the baselines the new parts reuse.

| Target | 375 × 812 | 320 × 700 |
|---|---|---|
| Fitness `.trend-card` (today, two cards) | 343 × 288 | 288 × 288 |
| `.trend-plot-wrap` / `.trend-plot` | 311 × 180 | 256 × 180 |
| `.trend-summary` (two lines) | 311 × 44 | not measured |
| `.sub-type-btn` (Bike form, venue toggle) | 109 × 44 | not measured |
| `.template-card` (plan mode picker) | 343 × 78 | not measured |
| Bike form `.form-input` | 343 × 50 | not measured |

Page width equals the viewport at 320 (`scrollWidth` 320), so the Fitness group
has no horizontal scroll today and must not gain one. The new parts hold the
44px floor: the Spin picker rows are at least `--touch-target` tall (a new token, below;
the `.sub-type-btn` measure, 44), and the Bike card in the plan picker is a
`.template-card`, so 78 at 343.

Two facts about the app that shaped this note, both read from the code, not
assumed:

- **Plan mode is weight-only.** `#/workout/new?plan=<date>` starts at the
  template step and never shows the type step. The Bike type in the ordinary
  flow opens a log-now form whose date input has `max` set to today. There is
  no way to plan a bike workout in the app, so this issue adds one.
- **The planned card already fits.** `PlannedCard` shows a date block, the
  name and an estimate (`formatEstimate`), and links to the detail view. A
  planned ride needs nothing there.

---

## Part 1 — FTP in Trends

### Where it sits, and why two cards

FTP is added to the existing **Fitness** group after Training Load, as two
metrics, each a normal Trends card:

| Metric | id | Card title | Unit | Value |
|---|---|---|---|---|
| FTP | `ftp` | `FTP` `W` | W | whole watts |
| FTP per kg | `ftp_wkg` | `FTP per kg` `W/kg` | W/kg | two decimals |

Both are in the Custom picker's **Fitness** section, which shares the group's
list, so a stored custom set is unchanged and a new pick lands in canonical
order.

**Two cards, not a toggle.** The prototype's W / W·kg switch would be the first
per-card control in Trends and would need its own stored preference; the group
already has the shape for "one metric, one card" and Body shows weight and body
fat the same way. Two cards cost one card of scrolling and no new control. The
Fitness group then holds four cards, the group maximum.

Group order stays recovery, sleep, fitness, body, blood pressure, activity,
intake, custom. The Day screen does not link to Fitness, so nothing else moves.

### What a held value looks like

FTP is not read daily. It is what it was until someone changes it, so the card
draws that rather than dots with gaps.

**The step line.** In `--chart-line`, `2` stroke as the average line has, flat
from an entry's date to the day before the next entry's date, then straight up
or down to the next level on the day that entry takes effect; after the last
entry it runs to today. When the range starts after an entry, the line starts
on the range's first day at the FTP then in effect and has no dot there.
Blank breaks it: where an entry has no value (W/kg with no weight that day) the
line stops and starts again at the next entry that has one.

**Dots on entry days only,** `r` as the other metrics' dots:

| Source | Dot | Not colour alone |
|---|---|---|
| `ramp_test` | filled, `--chart-line` | filled |
| `manual` | `--color-surface` fill, `--chart-line` ring | hollow |

The hollow ring is the shape the chart already uses for "partial", but nothing
else on an FTP card is partial, and the legend says what each means.

**Legend,** one line under the plot, `--text-xs` `--color-text-secondary`:
`● Ramp test   ○ Set by hand`. A kind that has no entry in the range is left
out; with neither, no legend.

**Not drawn:** the rolling average, the "Your range" band, and the Average
control's effect (changing Average changes nothing on these two cards, as it
changes nothing on a card with no values). `zeroBased` is off: the y axis is
the entries' span, padded, as Weight's is.

**The summary line** (above the plot, one grid cell with the readout, as every
card):

`Current 262 W since Nov 7 · 2 entries in range`

- Current is the FTP in effect today, `since` the newest entry's date
  (`shortDate`, with the year only when it is not this year).
- `1 entry in range` / `N entries in range`; with none in range, `No entries in
  this range`.
- No delta, arrow, "up from" or comparison, ever: Trends charts show and never
  conclude. The prototype's "+37 W since January" is the sentence that rule
  forbids. The entries list below carries the history.
- W/kg card: `Current 3.19 W/kg since Nov 7 · 2 entries in range`. When the
  current entry has no weight that day: `Current — since Nov 7 · no weight that
  day`.

### The entries list

Under the plot, in the same card, a list of the entries **in the range**,
newest first:

```
Sat, Nov 7      Ramp test       262 W
Tue, Aug 24     Ramp test       244 W
```

- A row: date as `rowDate`, source as words (`Ramp test`, `Set by hand`),
  value as the card's format with its unit. `--text-sm`; the source in
  `--color-text-secondary`; the value in the same weight as a card's readout value
  (tabular figures).
- Rows are separated by `--color-border-light` hairlines, never nested cards;
  each is at least 44px tall; it is a plain list, not interactive, so it has no
  hover or pressed state and is not in the focus order.
- A W/kg row for an entry with no weight reads `—` in place of the value, and
  its source cell reads `No weight that day`.
- A range with no entries shows no list at all.
- The list is a `<ul>` with an accessible name `FTP entries, <range phrase>`.

This is the prototype's list, kept: it is the only place a hand-set FTP's date
is written out, and the Table view alone would bury six rows in ninety.

### Selecting a day, the readout and the table

Selecting works as on every card (#247): a tap or arrow key picks a day, the
hairline and marker draw, the readout replaces the summary in its cell. For
FTP the day's value is the **FTP in effect that day**:

| Day | Readout line 2 |
|---|---|
| An entry day | `262 W · ramp test` / `262 W · set by hand` |
| A day between entries | `262 W · since Nov 7` |
| A day before the first entry | `—` |
| (W/kg) an entry or a held day with no weight at that entry | `— · no weight that day` |

The marker on the chart sits on the step line at that day, filled or ringed as
the day's dot would be (on a held day, the plain filled marker `--color-text`
the other cards use).

The **Table view** lists the in-effect value for every day from the first
entry, `—` for earlier days, and the source on entry days, in the same words as
the readout. Table and readout come from the same cells, so they cannot
disagree. The screen-reader announcement is the readout sentence per card.

### States

| Case | The FTP cards show |
|---|---|
| Loading | the group's `Loading…`, as today (the group now also waits on `FtpHistory`) |
| `FtpHistory` read fails | the group's standard `Couldn't load your health data.` and Try again, as for every group that reads a failed tab |
| Tab missing (before #765's migration) | empty, not an error: the empty state below |
| No entries ever | `No FTP yet. A ramp test in Thrive Spin adds one.` in place of the chart (the card's `emptyText`; the same text on both cards) |
| Entries exist, none in range, one in effect | the held line across the range, no dots, no list; summary `Current 262 W since Jul 4 · No entries in this range` |
| Entries exist, all dated after today | as "No entries ever" |
| One entry | a line from its date to today with one dot; `1 entry in range` |
| Weight never recorded (W/kg) | the card shows `No FTP per kg yet. It needs a weigh-in on the day of an FTP entry.`; the FTP card is unaffected |
| Two entries on one date | the newest by `created` only |
| Entry with a blank or non-numeric `ftp_w` | skipped, never drawn as 0 |

### Accessibility

Same text alternative as other Trends charts. The chart is `role="img"` named
`FTP, last year` (`<label>, <range phrase>`), `aria-describedby` the summary,
and the Table view is the data. The legend is text, so the two dot kinds are
told apart by shape and by words. No new interactive element: the cards add
none beyond the existing day selection.

### Copy

`FTP`, `FTP per kg`, `W`, `W/kg`, `Ramp test`, `Set by hand`,
`Current 262 W since Nov 7`, `1 entry in range`, `N entries in range`,
`No entries in this range`, `No weight that day`,
`No FTP yet. A ramp test in Thrive Spin adds one.`,
`No FTP per kg yet. It needs a weigh-in on the day of an FTP entry.`

### Not carried from the prototype

- **The W / W·kg toggle**, for the reason above.
- **The delta line**, for the rule above.
- **The "Last test 7 Nov … Plan a retest" card.** A nudge to test every 6–8
  weeks is a recommendation, and the epic excludes coaching. Planning a retest
  is also now possible by planning a bike workout with the ramp-test Spin
  workout.

---

## Part 2 — Planning a bike workout

### The main path

1. On Day (today or a future date) or Calendar, the owner taps **Plan in
   Thrive**, as today. The template picker opens in plan mode, headed `Choose a
   template`.
2. Under **Build Custom** there is a new card, **Bike workout**, with the line
   `Plan a ride, with a Spin workout if you like`. Weight planning is
   unchanged: the same two taps from Day to a template. (The prototype put a
   bike-only sheet behind its `+ Plan` button; here the one existing entry
   stays, so a weight plan costs no extra tap.)
3. The **bike planner** opens, a sibling of the weight planner with the same
   header (`← Back` and `Save Workout`, which `btn btn-primary` and is
   disabled while saving) and the same `screen template-editor` shell. Fields,
   in order, as `.form-group`s:

   | Label | Control | Default |
   |---|---|---|
   | `Workout Name` | text | `Bike` |
   | `Scheduled for` | date, no `max` | the plan date from the URL, else today |
   | `Spin workout (optional)` | a button showing the choice | `None` |
   | `Estimated duration (minutes, optional)` | number | blank |
   | `Type (optional)` | `SubTypeToggle`: Mountain, Gravel, Indoor | none |

4. Tapping the Spin workout button opens the **Spin picker** (below). Choosing
   a workout fills the fields it can and closes the sheet.
5. `Save Workout` writes the plan (`saveWorkoutForLater`, type bike) and goes
   to the list, as the weight planner does, with the same `Workout saved for
   later` toast. The Day screen then shows an ordinary planned card: the name
   and, when set, the estimate (`1 h`). **Nothing is added to the Day
   screen.** A trainer ride stays an ordinary activity.

The button's text is the choice: `None`, or `Sweet Spot 3×12`, followed by
`›` (`aria-hidden`) at the end, as the Day cards' links show it.

### What choosing a workout fills in

Choosing a workout fills three fields **only where the field still holds what
the form put there**, never over something the owner typed or picked:

| Field | Filled with | Left alone when |
|---|---|---|
| Workout Name | the workout's name | the name differs from `Bike` or from the last name the picker filled |
| Estimated duration | the workout's `duration_s` in whole minutes, rounded to the nearest | the field has been typed in or cleared by the owner |
| Type | `Indoor` | any venue is selected |

Each stays an ordinary editable field afterwards. **Choosing `None` clears the
link and touches nothing else.** Choosing a different workout refills the
fields the picker had filled and no others. Why fill at all: a plan's name and
estimate are what the Day card shows, and the owner should not have to retype
`Sweet Spot 3×12`; why only when untouched: a typed `Z2 with Dave` must
survive.

### The Spin picker

A modal bottom sheet, the same shell as the other sheets (`modal-overlay`,
`modal-content`, `useModalFocus`), not a new component family.

```
Spin workout                                     ×
─────────────────────────────────────────────────
○ No Spin workout        Just a bike plan
● Sweet Spot 3×12        Sweet spot · 1 h 14 min
○ Endurance 75           Endurance · 1 h 15 min
○ VO2 Max 5×3            VO2 · 55 min
○ Recovery Spin 30       Recovery · 30 min
```

- The title is `Spin workout`, an `h2` named by the dialog. The close control is
  a 44 by 44 target named `Close`.
- Rows are radio cards in a `role="radiogroup"` named `Spin workout`, each at
  least 44px tall (`--touch-target`), name at `--text-base`
  in the weight of a `.template-name`, second line `--text-sm` `--color-text-secondary`.
  The selected row has `--color-primary-light` fill, `--color-primary-on-light`
  text and a check `✓` before the name: the tick is the non-colour cue.
- Order: `No Spin workout` first, then the library by name (what `getRideWorkouts`
  returns, which is the order the tab is read in after sorting).
- Duration reads `30 min`, `1 h`, `1 h 14 min`, as `formatEstimate` writes
  other estimates.
- Choosing a row selects it, fills the fields and closes the sheet in one tap;
  there is no Continue button, because nothing is lost by choosing again.
- **Closes on:** choosing a row, the close control, `Escape`, the overlay.
  Focus returns to the Spin workout button.
- **Keyboard:** the radio group's arrow keys move, `Enter` or `Space` chooses.
- Opening the sheet reads the library once per app session (see States); the
  library does not poll.

### States

| Case | The picker shows |
|---|---|
| Loading the library | `Loading…` (`role="status"`) under the title, with `No Spin workout` already choosable |
| Loaded, has workouts | as drawn above |
| Empty, or the tab does not exist yet | `No Spin workouts yet. Build one in Thrive Spin.` under `No Spin workout` |
| Read failed | `Couldn't load your Spin workouts.` with a **Try again** button; `No Spin workout` stays choosable |
| Offline | the same as a failed read |

**A failed or empty library never blocks Save.** The plan is a bike plan with
no Spin workout, and the planner's button reads `None`.

The planner's own states follow the weight planner: `Save Workout` shows
`Saving...` and is disabled while saving; back with unsaved changes asks the
standard `Discard changes?` confirm (`discardChangesCopy('plan')`); a save
failure shows the existing `Failed to save workout` toast and keeps the form.

### Editing a planned bike

`#/history/<id>/edit` for a planned bike (one made here or by the MCP) shows
the same **Spin workout (optional)** button between the Date and the Duration
fields, with the current choice, and saves a change or a clear to
`Workouts!AL`. The form saves only the fields that changed, as it does now
(`editInputsToPatch`), so an untouched link is not rewritten.

A **completed** bike's edit form has no Spin workout field. Its AL records what
was ridden, and an edit preserves it, as it preserves AE:AK and AM.

### Reading it on the detail screen

A planned bike with a link shows one line in the detail sheet, under the title
and before the note:

`Spin workout   Sweet Spot 3×12 · Sweet spot · 1 h 14 min`

Label in `--color-text-secondary`, value in `--color-text`, `--text-sm`. It is
text, not a link: the prototype's footnote said tapping a planned ride opens
Spin, but nothing in #766–#770 defines that hand-off, so it is not designed
here.

| Case | The line |
|---|---|
| Library loaded and the id is in it | as above |
| Library loaded and the id is not in it | `Spin workout   Removed from your library` |
| Loading | no line yet; it appears when the library has loaded (no layout jump: it is in the flow below the title) |
| Read failed | `Spin workout   Couldn't load it` |
| No link | no line |

The library is read when a screen that needs it opens (the picker, a planned
bike's detail or edit) and held for the session, like the other tabs; it is not
read at launch.

**Start Workout** on such a plan does what it does for any planned bike. It
does not open Spin and does not change the row. (The delivery of "finish that
ride completes the plan" is `saveRide`'s claim rule, #765.)

### Edge cases

| Case | What happens |
|---|---|
| The plan date is in the past | allowed, as the weight planner allows it; the Day screen shows it as overdue, as any plan |
| A workout is deleted in Spin after planning | the id stays in AL; the detail line says `Removed from your library`; editing shows `None` selected with the same words beside it until the owner chooses another |
| Name left empty | saves as `Bike`, as the weight planner defaults its name |
| Estimate `0`, negative or not a number | not saved, the field blank (`estimateMinutesToSeconds`'s existing rule) |
| Rapid double tap on Save | one row: the button is disabled while saving |
| Two Spin plans on one date | allowed; #765's claim rule refuses to guess and appends, which is its documented behaviour |
| MCP wrote the planned bike with no `sub_type` | the edit form shows Type with none selected |

### Interaction states (per #404)

Each new control joins an existing family:

| Control | Family | Notes |
|---|---|---|
| Bike workout card in the plan picker | `.template-card` (rows and cards) | rest, hover under `@media (hover: hover)`, pressed, focus ring |
| Spin workout button in the planner and edit form | `.form-input`-shaped button, 44px class | rest, hover, pressed, focus; no disabled state (always available) |
| Picker rows | radio cards, the Chips and toggles family | selected = fill, `✓` and `aria-checked`; hover and pressed still apply on top |
| Picker close, Try again | icon button, `.btn-secondary` | as today |

The classes this adds go in `interaction-states.test.ts`'s table in the same
change.

### Copy

`Bike workout`, `Plan a ride, with a Spin workout if you like`,
`Spin workout (optional)`, `None`, `Spin workout`, `No Spin workout`,
`Just a bike plan`, `No Spin workouts yet. Build one in Thrive Spin.`,
`Couldn't load your Spin workouts.`, `Try again`, `Removed from your library`,
`Couldn't load it`, `Workout saved for later`.

---

## New tokens

`--touch-target: 44px` — the suite language's touch floor, which Thrive writes
as a literal `min-height: 44px` in several rules today. This note is the first
to need it by name; it is added to `global.css` `:root` and used by the new
rows only (existing rules are not migrated here).

Nothing else. The dots, the line and the legend use `--chart-line`, `--color-surface`,
`--color-text`, `--color-text-secondary` and `--color-border-light`; the picker
uses `--color-primary-light`, `--color-primary-on-light`, `--touch-target` and
the spacing, radius and type scales. The ring and the fill for the two dot
kinds reuse the partial-dot treatment.

## For development

- The Trends change is in `components/trends/metrics.ts` (two metrics, a
  source for `FtpHistory` and one for the same-day weight, the held-value flag
  and its points), `trend-chart.tsx` (the step line, the two dot kinds, the
  legend), `trend-readout`/`readout.ts` (the in-effect wording) and
  `trends-screen.tsx` (the extra tab in `sources` and in the memo's keys). The
  entries list is a small component under `trends/`.
- `loadHealth` gains `FtpHistory` as a fourth tab beside the other three; a
  missing tab loads empty (`isMissingTabError`), as the others do.
- The library is read through the Sheets API's values endpoint, not through
  `getRideWorkouts`: the token caller cannot run it (#765).
- Demo mode needs FtpHistory rows over a year (ramp tests and one hand-set),
  weights on most of those dates and none on one, four Spin workouts, and one
  planned bike linked to one of them.
- A change to the drift list: `FTP_HISTORY_FIELDS` and `RIDE_WORKOUT_FIELDS`
  come from #765's mirror, not from this issue.
