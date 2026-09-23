# 359 — Trends: a metric or a group, over a window you choose

Tokens are from the standing [design-language.md](design-language.md), the ones
#350, #351, #352, #353, #356, #357 and #358 added are in
[350-foundation.md](350-foundation.md#new-tokens),
[351-day-screen.md](351-day-screen.md#new-tokens),
[352-check-in-and-journal.md](352-check-in-and-journal.md#new-tokens),
[353-todo-panel.md](353-todo-panel.md#new-tokens),
[356-training-panel.md](356-training-panel.md#new-tokens),
[357-health-panels.md](357-health-panels.md#new-tokens) and
[358-calendar.md](358-calendar.md#new-tokens), and the ones this issue adds are
under [New tokens](#new-tokens). The spec is [../spec.md](../spec.md) (§1, §6,
§9.2, §9.8, §9.10). The behavioural reference is the prototype,
[../prototype.html](../prototype.html): `viewTrends()`, `chartStats()`,
`chartKey()`, `chartCard()`, `chartLine()`, `chartBars()`, `chartCompare()`,
`chartOrdinal()`, `rolling()`, `periodAvg()`, `niceTicks()`, `frame()`,
`yAxis()`, `xTicks()`, `pathFor()`, `dotR()`, `showTip()`, `chartIndex()`,
`tableView()`, `valueText()`, and the `.filters`, `.segd`, `.caption`,
`.trend-grid`, `.tcard`, `.tc-*`, `.chart`, `.dtable` and `.tip` rules. Where
the prototype and the design language disagree, the design language wins, and
this note says where that happened — and it says, once, where this note departs
from the design language too.

This note builds on eight settled seams:

- **#350's frame and data interface** — the Trends tab, the router's "first
  segment picks the tab, the rest goes to the screen unparsed" rule,
  `getDataSource()`, the day-keyed reads, the `session` signal, and demo mode's
  rule that neither `localStorage` nor `sessionStorage` is touched.
- **#351's day screen** — `dayHref(date)` for **open this day**, the `today`
  signal, `DayRead` and `useDayRead` with its shared calls, background refresh
  and `retry()`, `PanelNote`, and `formatClock` / `formatHoursMinutes` in
  `src/day/format.ts`.
- **#352's entry rules** — `readEntries` is one request whatever the range, the
  check-in charts read `sleep_quality`, `energy` and `sleep_hours`, hours are
  displayed with `formatSleepHours`, and what this screen reads is the sheet, so
  entries are read afresh each time it opens.
- **#356's Thrive reads** — `readWorkouts` is one call for any range,
  `readWorkoutPlans` is not for this screen, and `Workout.status` is
  `'planned' | 'complete'`.
- **#357's health work** — `readHealth` is one call for any range,
  `src/data/range.ts` is imported unchanged for `RANGE_DAYS`,
  `RANGE_MIN_VALUES`, `valuesBefore`, `yourRange` and `Polarity`,
  `src/data/liveHealth.ts` is where `training_load` joins `Health`, and
  `HealthRow`'s unused `href` is the seam this issue takes.
- **#358's calendar** — the Shade-by row's treatment, reused for the group
  chips; the all-history read pattern and `CALENDAR_HISTORY_FLOOR`; and
  `CalendarStatus`'s shape, reused for this screen's status line.
- **#355's client** — the mapping from a refusal onto a `DayRead`, and the
  source words "Thrive" and "your almanac sheet".
- **The standing § Charts**, which settles every mark on this screen and which
  this note implements rather than re-argues.

**Nothing in `useDayRead`, `useCalendarRead`, `DataSource`, `src/day/`,
`src/calendar/` or any panel's folder changes.** Everything new is in
`src/trends/`, except one mapped field in `src/data/liveHealth.ts` and one prop
value passed to `HealthRow` — both seams the owning issues named.

Nothing in this note exists yet to measure. See [Numbers](#numbers).

---

## The route

The Trends tab gets whatever path segments follow `trends` (#350).

| Path | Shows | URL |
|---|---|---|
| `#/trends` | The group last used on this device; Recovery the first time | stays |
| `#/trends/recovery`, `/sleep`, `/activity`, `/fitness`, `/checkin`, `/custom` | That group | stays |
| Anything else: `#/trends/body`, `#/trends/foo`, `#/trends/recovery/x` | The remembered group | replaced with `#/trends`, no new history entry |

`#/trends` means "Trends, where I left off", exactly as #351's `#/` means "today"
and #358's `#/calendar` means "the month I am in". #350's tabs link to `#/trends`,
so the tab and the URL agree and a repeated tap is a no-op. `#/trends/<group>` is
what a link from anywhere else uses, and what the screen writes once you choose a
group, so a URL never claims a group that is not showing.

`#/trends/body` and `#/trends/bp` fall through to the remembered group today, and
become real when #354 adds those two groups.

`src/trends/routes.ts` holds the small vocabulary:

```ts
export type TrendGroup = 'recovery' | 'sleep' | 'activity' | 'fitness' | 'checkin' | 'custom';
export function isTrendGroup(value: string): boolean;
export function trendsHref(group: TrendGroup): string;                // '#/trends/<group>'
export function parseTrendsPath(rest: string[], remembered: TrendGroup): { group: TrendGroup; replace: boolean };
```

- **`trendsHref`** is always `#/trends/<group>` — unlike `dayHref` and
  `calendarHref` it has no "the default one" short form, because the default here
  is a remembered preference rather than a fact about today, and a link that
  means "wherever you left off" is not a link anyone would want to send.
- **Choosing a group replaces the history entry**, #351's and #358's rule for
  moving within a screen. Walking all six groups and pressing Back leaves Trends
  rather than walking back through them. Arriving at Trends from another tab or a
  link still pushes (#350).
- **Document title: "Trends · almanac" always** — #350's, unchanged. The group is
  a view control like the range and the average, and moving between groups
  replaces the history entry, so there is never a second Trends entry to tell
  apart. *A departure from #358*, which titles a month, and the difference is
  that a month is the thing the URL names while a group is one of six views of
  one screen.
- **Today follows Denver**, through #351's `today` signal. At midnight every
  range's last day moves, the three reads' keys gain a day and are read again,
  and yesterday becomes a plotted day for steps and training time.

---

## The screen, top to bottom

Phone, below 960px, on the Recovery group with a 3M range and a 7-day average:

```
┌─────────────────────────────────┐
│ ⬡ almanac                  (👤) │  top bar (#350)
├─────────────────────────────────┤
│ Trends                          │  heading
│ (Recovery)(Sleep)(Activity)(Fi… │  a scrolling row of groups
│ Range (1W)(1M)(3M)(6M)(1Y)(All) │  the controls row,
│ Average (Off)(7d)(14d)(30d) [▦] │  wrapping at this width
│ Jun 25 – Sep 23, 2026 · line =  │  the caption
│ 7-day rolling average, dots =   │
│ each day · shaded band = your…  │
│ ┌─────────────────────────────┐ │
│ │ Resting HR            52    │ │  a chart card: label and unit
│ │ bpm              average    │ │  left, headline right
│ │              ↓ 2 vs prev 3m │ │
│ │  56 ┤    ·  ·      ·        │ │
│ │  52 ┤▓▓·▓▓▓▓·▓▓▓▓▓▓▓▓▓●52   │ │  band, dots, the average line
│ │  48 ┤                       │ │
│ │     └──Jul───Aug───Sep──    │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ HRV  ms          38 average │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ Sleep (watch)  7h 04m avera…│ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ Training time   min / day   │ │
│ │ context for the charts abov…│ │
│ │ ▁▃▁▅▂▁▁▃▅▁▂▁▃▁▁▅▂▁▃▁▂▁▁▃▁   │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│    Day     Calendar    Trends   │  bottom bar (#350)
└─────────────────────────────────┘
```

Wide, 960px and up — the same screen, two chart columns:

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⬡ almanac        ( Day | Calendar | Trends )                   (👤)   │
├──────────────────────────────────────────────────────────────────────┤
│ Trends                                                                │
│ (Recovery)(Sleep)(Activity)(Fitness)(Check-in)(Custom)                │
│ Range (1W)(1M)(3M)(6M)(1Y)(All)   Average (Off)(7d)(14d)(30d)   [▦ Ta…│
│ Jun 25 – Sep 23, 2026 · line = 7-day rolling average, dots = each da… │
│ ┌────────────────────────────────┐  ┌────────────────────────────────┐│
│ │ Resting HR  bpm    52 average  │  │ HRV  ms          38 average    ││
│ └────────────────────────────────┘  └────────────────────────────────┘│
│ ┌────────────────────────────────┐  ┌────────────────────────────────┐│
│ │ Sleep (watch)  7h 04m average  │  │ Training time  min / day       ││
│ └────────────────────────────────┘  └────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

The chart grid is one column below 960px and two equal columns from 960px, both
`--space-sm` apart, top-aligned (the prototype's `.trend-grid`). **The DOM order
is the group's metric order at both widths**, so nothing remounts when the layout
crosses 960px and no read is repeated — #358's arrangement, for #358's reason.
The charts redraw at the new width, which is the only thing that happens.

### Heading

**Trends** as the page's only `h1`, `--text-2xl`, weight 700, `--color-text`,
with `tabindex="-1"` so focus can be moved to it, `--space-sm` above. There is no
sub-heading and no Today control: Trends always ends at today, so there is
nowhere to return from.

### The group row

Directly under the heading, `--space-sm` above and `--space-sm` below: six toggle
buttons in a `role="group"` labelled "Metric group", **with no visible label** —
the group names say what they are, and a "GROUP" label above six group names is
a word doing nothing.

| Button | `TrendGroup` | Charts, in order |
|---|---|---|
| Recovery | `recovery` | Resting HR, HRV, Sleep (watch), Training time |
| Sleep | `sleep` | Sleep: watch vs you said, Sleep quality |
| Activity | `activity` | Steps, Training time |
| Fitness | `fitness` | VO₂ max, Training load |
| Check-in | `checkin` | Energy, Sleep quality, Hours slept (you said) |
| Custom | `custom` | Up to four, chosen below |

Each is #352's choice-button treatment exactly, as #358's Shade by row uses it:
at least 40px tall, `--space-sm` padding at the sides, `--radius-full`,
`--text-sm` weight 600, with `aria-pressed`; unselected is `--color-surface` with
a 1px `--color-border` border and a `--color-text-secondary` label, hover turns
the border `--color-text-muted`, selected is `--color-primary-light` fill, a 1px
`--color-primary` border with a second inset 1px ring, and a `--color-primary`
label at weight 700, and keyboard focus is `--focus-ring`. Exactly one is pressed
at all times; tapping the pressed one does nothing.

**The row scrolls sideways** at narrow widths, exactly as #358's does: it bleeds
to the viewport edges with `--space-md` negative margins and `--space-md`
padding, has no visible scrollbar, and scrolls the pressed button into view when
the screen mounts. Six names are longer than five, and the arithmetic #358 did
for five says they will not fit a 360px phone (see [Numbers](#numbers)).

### The controls row

One row under the groups, `--space-sm` below, wrapping, with `--space-sm` between
items on a line and `--space-md` between groups of them — the prototype's
`.filters`. It scopes every chart in the group (§ Charts, and the design
language's rule that controls sit in one row above the charts).

```
Range (1W)(1M)(3M)(6M)(1Y)(All)   Average (Off)(7d)(14d)(30d)   [▦ Table]
```

- **Two segmented controls.** Each is a label — "Range", "Average" — at
  `--text-xs`, weight 700, upper case, `--tracking-caps`,
  `--color-text-secondary`, then a `role="group"` labelled by it holding its
  buttons on a `--color-sunken` track with `--radius-full` and `--space-xs`
  padding. Each button is at least 40px tall, `--space-sm` padding at the sides,
  `--radius-full`, `--text-xs` weight 700, `--color-text-secondary`, with
  `aria-pressed`; the pressed one is a `--color-surface` fill with `--shadow-sm`
  and a `--color-text` label. That is #350's wide-screen tab treatment, which is
  the same object — a segmented control — and it should not look like a second
  one. *A departure from the prototype*, whose segment buttons are 32px tall
  against the design language's 40px minimum, the same correction #350 made to
  the top tabs.
- **Table** is a toggle at the end of the row: the prototype's `.btn-outline`, as
  #356 uses it — a 1px `--color-border` border, `--color-surface` fill, an icon at
  `--icon-sm` and the label at `--text-sm` weight 600 in `--color-text`,
  `--radius-md`, `--space-md` padding at the sides, at least 40px tall, border and
  label turning `--color-primary` on hover — with `aria-pressed`. It reads
  **Table** with the `table` icon while the charts are showing and **Charts** with
  the `chart` icon while the table is.

| Control | Values | Default |
|---|---|---|
| Range | 1W · 1M · 3M · 6M · 1Y · All | 3M |
| Average | Off · 7d · 14d · 30d | 7d |
| Table | off · on | off |

### What the ranges mean

| Range | Days | From |
|---|---|---|
| 1W | 7 | `addDays(today, −6)` |
| 1M | 30 | `addDays(today, −29)` |
| 3M | 91 | `addDays(today, −90)` |
| 6M | 182 | `addDays(today, −181)` |
| 1Y | 365 | `addDays(today, −364)` |
| All | every day there is | `historyStart` |

Every range ends on **today**, inclusive, so the right edge is always the same
date and switching ranges is a change of how far back you are looking and nothing
else.

**`historyStart` is the earliest date any of the screen's three reads has a key
for** — the earliest workout, the earliest health row, the earliest entry —
computed from the answers rather than from a constant, the way #358's
`firstValueDate` is. It is one span for every group, not one per group, because a
group is small multiples on **one shared date axis** (§ Charts) and an axis that
changed length when you changed group would make two groups uncomparable. Until
every read the group needs has landed there is no `historyStart` and no chart; if
they all land empty, All falls back to the 1M span and every chart says it has
nothing.

### The caption

Under the controls, `--space-sm` below, at `--text-xs` in
`--color-text-secondary`, wrapping — the prototype's, and the place the band and
the line are said in words rather than only drawn:

> Jun 25, 2026 – Sep 23, 2026 · line = 7-day rolling average, dots = each day ·
> shaded band = your range (mean ± 1 SD of the last 30 days). Blank days stay
> blank.

- The dates are `MMM d, yyyy`.
- The middle clause is "line = 7-day rolling average, dots = each day" with an
  average chosen, and "line joins each day" with it Off.
- The band clause appears only when a chart in the group draws a band — that is,
  when the group holds resting HR, HRV, sleep or steps.
- "Blank days stay blank." is the spec's discipline said out loud (§6, and the
  design language's § Showing data), and it is not optional: a reader who cannot
  see a dot needs to know that nothing was drawn rather than that zero was.

---

## The metrics

`src/trends/metrics.ts`. One catalogue, so "resting HR" is spelled in one place
and the charts, the tooltip, the table and the headline all read the same.

| Key | Label | Unit | Kind | Value for a date | Band | Polarity |
|---|---|---|---|---|---|---|
| `rhr` | Resting HR | bpm | line | `Health.resting_hr` | yes | `'down'` |
| `hrv` | HRV | ms | line | `Health.hrv` | yes | `'up'` |
| `sleep` | Sleep (watch) | hours | line | `Health.sleep_total_s / 3600` | yes | `'up'` |
| `steps` | Steps | — | line | `Health.steps`, never today | yes | `null` |
| `train` | Training time | min / day | bars | that day's completed workouts, never today | no | `null` |
| `vo2` | VO₂ max | ml/kg/min · COROS | line | `Health.vo2max` | no | `'up'` |
| `load` | Training load | COROS | line | `Health.training_load` | no | `null` |
| `sleepcmp` | Sleep: watch vs you said | hours | compare | `Health.sleep_total_s / 3600` and `Entry.sleep_hours` | no | — |
| `quality` | Sleep quality | your check-in | levels | `Entry.sleep_quality` | — | — |
| `energy` | Energy | your check-in | levels | `Entry.energy` | — | — |
| `youhrs` | Hours slept (you said) | your check-in | line | `Entry.sleep_hours` | no | `null` |

- **Band** is exactly the four metrics spec §9.8 names — resting HR, HRV, sleep
  and steps. Nothing else gets one, because §9.8 does not define one for anything
  else and inventing a band for VO₂ max would be a comparison the spec has not
  made.
- **Polarity** is #357's `Polarity`, imported from `src/data/range.ts` rather
  than retyped, and it is used here for one thing only: whether the headline's
  change is coloured. VO₂ max is `'up'` — higher is the welcome direction, which
  is not a verdict about a day but the same kind of fact §9.8 records for HRV.
- **Formatting** is one function per metric, and the same one is used by the
  headline, the tooltip, the table and the axis labels, so a number never reads
  two ways on one screen:

| Key | A value | An axis tick | The change |
|---|---|---|---|
| `rhr` | 52 | 52 | 2 |
| `hrv` | 38 | 38 | 3 |
| `sleep` | 7h 12m (`formatHoursMinutes`, #351) | 7h | 14 min |
| `steps` | 9,412 (`toLocaleString('en-US')`) | 9k | 412 |
| `train` | 38 min | 40 | 6 min |
| `vo2` | 43 | 43 | 1 |
| `load` | 61 | 60 | 4 |
| `sleepcmp` | 7h 12m · you 7½ h | 7h | — |
| `quality` | Good | *(the three levels)* | — |
| `energy` | High | *(the three levels)* | — |
| `youhrs` | 7½ h (`formatSleepHours`, #352) | 7h | 15 min |

  **The watch's sleep and yours are formatted differently on purpose.** The watch
  measured 7h 12m; you said 7½ h. #352 fixes `formatSleepHours` for the
  self-report and #351 fixes `formatHoursMinutes` for a duration, and spec §6
  says the two measurements never merge — showing them in two forms is that rule
  where a reader can see it.

### Training time

`train` is the day's **completed** workouts — `status === 'complete'` — summed
over `moving_seconds`, falling back to `elapsed_seconds` where a workout has no
moving time, in whole minutes. The prototype's `trainMin()`, with two rules it
leaves implicit:

- **A day with no workouts is a genuine 0**, from the first date the workouts map
  has a key for, onward. Not training is a fact; the bars simply show nothing
  that day, and the average over the range counts the rest days, which is what
  "min / day" means.
- **Before that first date there is no value at all.** A year of zero bars before
  Thrive's history begins would claim you did not train when almanac was simply
  not told. `firstWorkoutDate(data)` is the earliest key in the all-history
  `readWorkouts` answer — #358's `firstValueDate`, one map over.
- **Planned workouts are never counted**, on any day. A plan is not training
  time, and a past day's unfulfilled plan least of all (#356).

### Today, and the totals that grow through it

**Steps and training time have no value for today.** Both are totals that grow
through the day, and #357 already settled what that means: "a part-day total
against a whole-day range says 'below your range' every morning, which is true of
the clock and not of you". Plotted on a chart the error is larger, because a
partial day at the right edge also drags the rolling average down and lands in
the range's average and in the change against the previous period.

So both charts stop at yesterday, the axis still runs to today, and the chart's
key line says so:

> today isn't shown — the day isn't over

Every other metric shows today as soon as it has a value: last night's sleep,
resting HR and HRV are complete once the sync brings them, VO₂ max and training
load are the day's scores, and a check-in is a thing you did.

---

## A chart card

`ChartCard` in `src/trends/`. A `article` with `--color-surface`, a 1px
`--color-border` border, `--radius-md` and `--space-sm` padding, holding a
header, an optional key line, and the plot.

```
┌────────────────────────────────────────────┐
│ Resting HR                    52           │  label + unit left,
│ bpm                           average      │  headline right
│                               ↓ 2 vs previous 3 months
│ today isn't shown — the day isn't over     │  the key line, when there is one
│  [ the plot ]                              │
└────────────────────────────────────────────┘
```

### The header

One row, items aligned to their tops, `--space-sm` apart:

- **The label**, an `h2` at `--text-sm`, weight 700, `--color-text`, with the
  **unit** under it at `--text-xs` in `--color-text-secondary`. The unit is where
  a chart says where its numbers come from — "ml/kg/min · COROS", "your check-in"
  — so the source is on the chart rather than only in a legend.
- **The headline**, pushed right and right-aligned: the value at `--text-xl`,
  weight 650, `--color-text`, **without `tabular-nums`** (the design language: a
  column of numbers takes it, a lone large number does not), then one or two
  lines at `--text-xs` in `--color-text-secondary`.

### The headline

| Kind | Value | Under it |
|---|---|---|
| line, bars | the mean over the range | "average", then the change |
| compare | the watch's mean | "watch average · you said 7½ h" |
| levels | "Mostly Good" | "Good 41 · OK 22 · Poor 6 · not set 12" |

- **The mean** is over the days in the range that have a value, which for
  training time includes the genuine zeros and excludes the days before its
  history starts. With no value in the range at all it is "—" with "no data in
  range" under it.
- **The change** is the range's mean against the mean of the period of the same
  length immediately before it: `[from − n, from − 1]`. It appears only when both
  periods have a value and the range is not All, which has no "before".

  > ↓ 2 bpm vs previous 3 months · ↑ 14 min vs previous month · same as previous
  > week

  The arrow is the prototype's `up` or `down` at `--icon-xs` (#357),
  `aria-hidden`; the words carry it. "same as" replaces the arrow and the number
  below the metric's threshold — a minute for the two sleep metrics, half a unit
  for everything else (the prototype's).
- **Colour.** The change turns `--color-success` when it moves in the direction
  §9.8 calls welcome for that metric, and `--color-warning` when it moves the
  other way. A metric with no polarity — steps, training time, training load,
  hours slept — is never coloured, and neither is a "same as".

  *This is the one place on this screen where anything is coloured good or bad,
  and it says nothing the words do not.* §9.8 already fixes which direction is
  unwelcome for resting HR, HRV and sleep, and §1 forbids concluding: the
  sentence is a number, a direction and a period, and the colour marks the
  direction it already names. There is no "better", no "worse", and no verdict on
  the range as a whole.

### The key line

Under the header, `--space-xs` above, at `--text-xs` in
`--color-text-secondary`, wrapping, with `--space-md` between items — the
prototype's `.tc-key`. It appears only when a chart has something to say that is
not in the caption:

| Chart | Key |
|---|---|
| Training time, in Recovery | context for the charts above · today isn't shown — the day isn't over |
| Training time, in Activity or Custom | today isn't shown — the day isn't over |
| Steps | today isn't shown — the day isn't over |
| Sleep: watch vs you said | *(a line swatch)* watch · *(a hollow dot)* you said |

The compare chart is the only one on this screen with two series, and so the only
one that gets a legend — the design language's rule that a mark never carries
meaning alone, and the dataviz convention that one series needs no legend because
the title names it. Its swatches are a `--color-primary` line segment and a
hollow dot in `--color-surface` with a `--color-text-secondary` ring, drawn as
the chart draws them.

---

## The plot

Inline SVG, drawn from the metric's values into a box the card measures. Each
plot is one `svg` with `role="img"` and an `aria-label` naming the metric and the
range — "Resting HR, 3 months" — because the numbers themselves are reachable in
the table view and through the crosshair's readout, and a screen reader read 91
dots is worse than either.

**Why inline SVG and not a chart library.** Four reasons, in order:

1. **§ Charts already specifies every mark** — the dot, the 2px line, the end dot
   and its value, the band, the bars, the weekly rollup, the three-row levels
   chart, the hollow self-report dots, one crosshair across a group. Three of the
   four chart kinds here are not a library's chart type, so a library would be
   configured out of the way and then drawn around.
2. **`stack-web` verifies a browser UI by reading the DOM, not the screen.**
   Inline SVG leaves every dot, bar and axis label in the DOM where `/test` can
   assert on it with `getBoundingClientRect()` and `getComputedStyle()`. A
   canvas-backed library (uPlot, Chart.js) leaves nothing to assert on, which is
   the failure `stack-web` records from cairn #2.
3. **Weight and interop.** almanac is Preact with `preact/compat` aliases
   (`CLAUDE.md`); a React chart library brings a compat surface and 40–200 KB to
   the last issue in the plan, for geometry the prototype already implements in
   about 150 lines. `stack-web`'s rule about CSS frameworks — "add one when
   there's a second opinion to reconcile, not before" — is the same judgment.
4. **The prototype is the reference implementation.** `chartLine`, `chartBars`,
   `chartCompare`, `chartOrdinal`, `niceTicks`, `rolling` and `xTicks` port
   directly, with the corrections this note names.

No dependency is added by this issue.

### The frame

`frame(width, height, n)` gives the plot box inside the SVG: a left gutter for
the y labels, a right gutter for the end label, and a bottom band for the date
axis. **The plot box is sized to include the axis band**, so a card never grows
an inner scrollbar. Widths come from a `ResizeObserver` on the plot element, with
a floor below which the chart is not narrowed further; the numbers and their
sources are in [Numbers](#numbers).

`--chart-h`, `--chart-h-bar` and `--chart-h-level` set the three plot heights;
they are tokens because they are the cards' visual rhythm. Everything else about
the geometry — the gutters, the dot radii, the stroke widths, the bar widths — is
arithmetic inside one component and is stated in [Numbers](#numbers) with its
source rather than given a token, which is how #357 records the range bar's scale
and #358 its quartile indices.

### Chrome, in every plot

- **Gridlines** are 1px solid `--chart-grid`; the baseline and the ticks are 1px
  solid `--chart-axis`. Solid, never dashed: a dashed grid reads as a projection.
- **Four y gridlines or so**, at round numbers — `niceTicks(lo, hi, 4)` picks a
  1, 2, 5 or 10 step — with the value at the left, right-aligned to the gutter,
  at `--text-xs` in `--color-text-secondary` with `tabular-nums`.
- **The date axis** picks the first of seven candidate rules whose labels fit the
  plot's width: every day as "Mon", every day as "M", every Monday as "Jul 6",
  the 1st and 15th, the 1st as "Jul", every other month, then every third month
  as "Jul 26". The prototype's `xTicks()`, unchanged — it is why a 1W chart reads
  as weekdays and a 1Y chart as months without a second rule being written.
- **No chart has a second y-axis**, ever (§ Charts, and the one rule dataviz
  calls the commonest chart mistake). Two metrics of different scale are two
  charts, which is what a group is.

### A line chart

`rhr`, `hrv`, `sleep`, `steps`, `vo2`, `load`, `youhrs`.

```
 56 ┤          ·
    │   ·   ·     ·    ·
 52 ┤▓▓▓▓▓▓·▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓●52
    │  ·        ·      ·
 48 ┤
    └──Jul────Aug────Sep──
```

1. **The band**, when the metric has one and `yourRange` returns a range: a
   `--color-band` rectangle spanning the plot from `lo` to `hi`, drawn first so
   everything else sits on it. It is `yourRange(valuesBefore(health, today,
   RANGE_DAYS, pick))` — #357's function, unchanged, over the 30 days before
   today, and `null` below `RANGE_MIN_VALUES` (14), in which case no band is
   drawn and the caption drops its band clause.

   **One band, not a ribbon.** §9.8 defines your range as of a date, and drawing
   it per day would give a band that moves under the series and invites reading
   each day against its own past — a comparison this screen does not make and the
   day screen already does. The caption says which 30 days it is, so it is never
   mistaken for a property of the whole span.
2. **A dot per day with a value**, in `--chart-dot`, its radius falling as the
   range widens so a year is dots rather than a smear.
3. **The line.** With an average chosen it is the rolling mean; with the average
   Off it joins each day and the dots take `--color-primary` (§ Charts). 2px,
   round join and cap, `--color-primary`, `fill: none`.
4. **A blank day breaks the line.** The path starts a new subpath at the next day
   with a value; nothing is interpolated across the gap.
5. **The end dot and its value:** the last day the line has a value for gets a
   filled `--color-primary` dot with a 2px `--color-surface` ring, and its value
   beside it at weight 700 in `--color-text` — the one direct label on the chart.
   Never a label on every point.
6. **The y scale** spans the range's own values, widened to include the band when
   there is one, plus 8% of the span at each end.

**The rolling average.** `rolling(values, n)` averages each day with the `n − 1`
days before it, and is `null` where fewer than `⌈n/2⌉` of those days have a
value, so an average never rides across a week the watch was off. **Its window
reaches back before the range's first day**, which works only because this screen
holds all of history: a 30-day average at the left edge of a 1W chart is a real
30-day average, not a ramp from nothing.

### Training time: bars

```
 60 ┤
 40 ┤ ▃   ▅     ▃ ▅   ▂   ▅
 20 ┤ █ ▁ █ ▁ ▁ █ █ ▁ █ ▁ █
    └──Jul────Aug────Sep──
```

- **One bar per day** up to 120 days of range; past that, **one bar per week,
  Monday-start, holding that week's total**. The first and last weeks of the
  range are their own buckets even when partial. The switch is the design
  language's ("bars, which become weekly totals past 120 days"), which puts 1W,
  1M and 3M on daily bars and 6M, 1Y and All on weekly ones.
- **Grown from the baseline**, `--radius-sm` at the top corners only and square
  at the baseline, capped so a bar is never wider than 24px and never fills its
  slot: the width is the slot less a 2px gap, so touching bars are separated by
  the surface rather than by a stroke.
- **Colour:** `--color-primary` in Activity and Custom, `--chart-dot` in
  Recovery, where the design language makes it context for the three charts above
  rather than a subject of its own.
- **A day or week with zero** draws no bar, which is the honest mark for "you
  didn't train": a 0-height bar and a missing bar look identical anyway, and the
  crosshair and the table both say `0` for it.
- **The average control does not apply.** Weekly totals are already an
  aggregation, and a rolling mean over bars would be a second one on the same
  marks. The same holds for the levels charts below.

### Sleep: watch vs you said

```
  9h ┤        ○
     │  ○  ●───●──●───●──○
  7h ┤●─────●        ○
     └──Jul────Aug────Sep──
```

The watch's nightly figure is the line — the rolling average when one is chosen,
joining each night when it is Off, with the per-night dots in `--chart-dot`
behind it — and **each self-report is a hollow dot**: `--color-surface` fill with
a 1.5px `--color-text-secondary` ring, one per night you said something, never
joined and never averaged.

Spec §6 is why: these are two different measurements and neither is wrong, so
they share a y-axis (both are hours) and nothing else. The distance between a
hollow dot and the line on a given night is the disagreement, which is the thing
this chart exists to show.

### Sleep quality and energy: levels

```
 Good ┤   ●  ● ●   ●●  ● ●   ●
   OK ┤ ●    ●   ●    ●    ●●
 Poor ┤        ●            ●
      └──Jul────Aug────Sep──
```

Three rows, evenly spaced, each labelled with its level in the y gutter — Poor /
OK / Good, Low / OK / High, bottom to top — and one `--color-primary` dot per day
you chose a level. A day you did not answer has no dot, and no row: an unset
check-in is never the middle option (spec §6, and the design language's § Showing
data).

There is no y-axis of numbers, because the levels are not numbers. Nothing on
this screen averages them, ranks them or scores them.

---

## Reading values: the crosshair and the tooltip

One crosshair for the whole group, one tooltip for the whole group (§ Charts).

- **Pointing at, or dragging across, any chart** snaps to the nearest day index
  and draws, **in every chart in the group**, a 1px `--color-text-secondary`
  vertical hairline at that date and a `--color-primary` dot with a 2px
  `--color-surface` ring on that chart's own value — its line where it has one,
  its dot or bar otherwise. A chart with no value that day shows the hairline and
  no dot.
- **The tooltip** follows the pointer, `--tip-min-w` to `--tip-max-w` wide,
  `--color-surface` with a 1px `--color-border` border, `--radius-md`,
  `--shadow-lg`, `--space-sm` padding, `--text-xs`, and `pointer-events: none` so
  it can never be hovered. It flips to the other side of the pointer rather than
  leaving the viewport. It holds:

  ```
  Sat, Sep 12
  52          Resting HR
  38          HRV
  7h 12m      Sleep (watch)
  38 min      Training time
  Mountain Bike, Upper Push A
  Click to open this day
  ```

  The date, then **one row per metric in the group** — the value first at
  `--text-sm` in `--color-text`, the metric's label after it in
  `--color-text-secondary`, because the reader already knows the metrics and
  wants the number — then that day's completed workouts by name, then the hint.
  A metric with no value that day reads "—". The date carries its year only when
  it is not this year.
- **Workout names are data.** They are inserted as text, never as markup.
- **Click, or a second tap, opens that day**: `dayHref(date)` (#351), pushing a
  history entry, so Back returns to Trends on the same group and range. On touch
  the first tap shows the readout and the second opens the day; with a mouse a
  click opens it directly. The hint says which: "Click to open this day" or "Tap
  again to open this day".
- **It hides** on Escape, on scrolling the page, and when the pointer leaves the
  charts with a mouse.

### The keyboard

The chart grid is **one tab stop**, with `role="application"`-free plain focus on
a wrapper labelled "Charts, <group>":

| Key | Does |
|---|---|
| ← / → | Moves the crosshair one day |
| Home / End | The first and last day of the range |
| Enter or Space | Opens the day the crosshair is on |
| Escape | Hides the crosshair |

Arriving by Tab puts the crosshair on the last day of the range. A visually
hidden `role="status"` region announces the readout — the same date, values and
activities the tooltip shows — **only when the crosshair is moved by the
keyboard**, so pointer movement never talks over anything.

*The prototype has no keyboard path at all.* This is the addition, and it is what
makes the tooltip an enhancement rather than a gate: every value it shows is also
in the table view, and the same readout is available without a pointer.

---

## The table view

`TableView` in `src/trends/`. The Table toggle replaces the chart grid with one
table, and the controls, the caption and the group row stay exactly where they
are.

```
┌────────────────────────────────────────────────────┐
│ Date         Resting HR   HRV   Sleep (watch)  Tr… │  sticky header
│ Tue, Sep 22, 26      51    41         7h 20m    0  │
│ Mon, Sep 21, 26      53    36         6h 48m   64  │
│ Sun, Sep 20, 26       —     —              —   38  │
└────────────────────────────────────────────────────┘
```

- **One row per day in the range, newest first.** A `th scope="row"` with the
  date — "Tue, Sep 22, 26" — then one cell per metric in the group, in the
  group's order, formatted exactly as the charts and the tooltip format them, and
  "—" where the day has no value.
- Column headers are `th scope="col"` with the metric's label, sticky to the top
  of a scroll box at most `--table-max-h` tall with a 1px `--color-border`
  border, `--radius-md` and a `--color-surface` fill. The header row is
  `--color-surface-raised`, `--text-xs`, weight 700, `--color-text-secondary`.
- Cells are `--text-sm` with `tabular-nums`, right-aligned, the date column left.
  Here the numbers *are* a column, which is why they take `tabular-nums` and the
  headline does not.
- The compare metric is one column reading "7h 12m · you 7½ h", the two
  measurements side by side and still not merged.
- **The table is the accessible twin of the charts**, not an extra view: it is
  where every value a crosshair can show is reachable without a pointer, which is
  what lets the charts stay sparse.

---

## The Custom group

Choosing **Custom** shows a picker block above the charts, `--space-sm` below the
controls: the label **CHOOSE METRICS** at `--text-xs`, weight 700, upper case,
`--tracking-caps`, `--color-text-secondary`, then the ten single-series metrics
as toggle buttons in a `role="group"`, wrapping, in the same treatment as the
group row, each with `aria-pressed`.

Offered: Resting HR · HRV · Sleep (watch) · Steps · Training time · VO₂ max ·
Training load · Energy · Sleep quality · Hours slept (you said). **Not** the
compare chart — it is two series in one chart and is a group of its own, and
picking Sleep (watch) and Hours slept (you said) gives the same two nights as two
charts, which is what a custom set is for.

- **Up to four.** A fifth is refused: the button does not press, and a line under
  the block says "Four at most — turn one off first." at `--text-xs` in
  `--color-text-muted`, with `role="status"`. Four is the design language's
  implicit limit — the group is small multiples and a fifth y-axis on a phone is
  a list, not a comparison — and the prototype's.
- **The charts follow the order in the catalogue**, not the order you pressed
  them, so turning one off and on again does not move the others.
- **The first time** Custom is chosen it starts as Resting HR, HRV and Energy
  (the prototype's), which is a set that spans all three sources and shows at
  once what the group is for.
- **With nothing chosen**, one `PanelNote` (#351) in place of the charts: "Choose
  up to four metrics for this group."

*A departure from the prototype*, which puts the picker in a bottom sheet behind
a "Choose metrics" button. almanac has no sheet or dialog component — #350 built
none — and inventing a modal pattern for the last screen in the plan, to hold ten
toggle buttons, costs more than it saves. Inline, the picker is visible, is
keyboard-reachable without focus management, and needs no new component kind.

---

## Reading, and what it costs

### Three reads, over everything, once

```ts
useDayRead('readHealth',   TRENDS_HISTORY_FLOOR, today)
useDayRead('readWorkouts', TRENDS_HISTORY_FLOOR, today)
useDayRead('readEntries',  TRENDS_HISTORY_FLOOR, today)
```

`TRENDS_HISTORY_FLOOR` is `CALENDAR_HISTORY_FLOOR` (#358), imported from
`src/calendar/shading.ts` and re-exported under this screen's name rather than
retyped: it is the same fact — a lower bound early enough that nothing can fall
below it — and two copies of `'2000-01-01'` is two places for one date.

**Every one of these costs exactly one call, whatever the range.** `readHealth`
is one `getDailySummary` because `getDailySummaries` reads the whole tab with
`getAllRows` and filters in memory (#357, #358); `readWorkouts` is one
`getWorkouts` for any range (#356); `readEntries` is one Sheets request for any
range (#350). Asking for all of history therefore costs what asking for a week
would, and it buys three things a per-range read cannot:

1. **Changing the range, the average, the group or the table sends no call.** The
   keys never change while the screen is open, so every control is answered from
   data already held, instantly, offline included.
2. **A 30-day average has its first 29 days.** `rolling` reaches back before the
   range's first day; over a per-range read it would have nothing to reach into.
3. **All is a real answer.** `historyStart` is the earliest key the answers
   actually have, so "All" means all of it rather than a constant someone chose.

### Why `useDayRead` and not a cache

#358 built `useCalendarRead` for a screen whose keys change every time you swipe
a month, and offered it here. This screen does not need it. **Its three keys are
constant**, so the one thing a cache adds — serving a landed answer with no call
— has nothing to serve while the screen is open, and the one thing `useDayRead`
does that a cache does not is exactly what #352 asks for: *"read entries afresh
each time the screen opens"*, because an entry saved on the day screen minutes
ago must show in the check-in charts.

So this screen reads through #351's `useDayRead`, unchanged, and:

- mounting reads all three (one call each, or joining one in flight);
- coming back to the tab re-reads all three in the background — what is on screen
  stays until the answer replaces it, and a re-read that fails leaves it and says
  nothing;
- Reconnect re-reads whatever was `session-expired`, by itself;
- **Try again** re-reads whatever is in `error`;
- moving between Trends and another tab re-reads, which is one Apps Script call
  per source and is the price of not holding a second cache.

**Nothing in `useDayRead` changes**, and nothing in `useCalendarRead` changes.
The cost of not sharing #358's map is that opening Trends after the Calendar
re-reads health rather than reusing the copy the Calendar holds: one call, once
per visit, against the three this screen makes anyway.

### What it costs

| What you do | Calls |
|---|---|
| Open Trends, first time this session | 3: health, workouts, entries |
| Change the range, the average, the group, the custom set or the table | 0 |
| Move the crosshair, open a day, come back | 0, then 3 on returning to the tab |
| Come back to the browser tab | 3, in the background |

At a second or more per Apps Script call (`implementation-plan.md` § Risks) and
60 Sheets reads a minute (#351), this is the cheapest screen in almanac per
question asked: three calls answer six groups, six ranges and four averages.

**What it costs instead is bytes.** All of `DailySummary` is a few hundred rows
and a few hundred kilobytes of JSON (#358's measurement of the same read); all of
`Workouts` is comparable; the almanac sheet is one row a day. They are held for
the life of the screen and re-read in the background, not accumulated.

### What a failure looks like

One status line, `TrendsStatus` in `src/trends/`, directly under the controls and
above the caption, built exactly as #358's `CalendarStatus` is — a `PanelNote`
(#351) with `PanelStatus`'s icons and sentences, and the sources it names joined
with "and".

| Situation | Line |
|---|---|
| Nothing has landed yet and something is in flight | After 300ms, "Loading…" in `--color-text-muted`, `role="status"` |
| One or more reads are `session-expired` | Alert icon in `--color-warning`: "Reconnect to load this." |
| One or more are `error`, and `navigator.onLine` was false | Alert icon in `--color-danger`: "You're offline — couldn't load from Thrive." · **Try again** |
| One or more are `error` | "Couldn't load from Thrive." / "Couldn't load from your almanac sheet." / "Couldn't load from Thrive and your almanac sheet." · **Try again** |
| One or more are `not-connected` | Info icon: "Thrive isn't connected yet." |

- **Only the reads the current group needs are consulted**, and no other read is
  ever named. A group asks for exactly what its metrics come from:

  | Group | Needs |
  |---|---|
  | Recovery | `readHealth`, `readWorkouts` |
  | Sleep | `readHealth`, `readEntries` |
  | Activity | `readHealth`, `readWorkouts` |
  | Fitness | `readHealth` |
  | Check-in | `readEntries` |
  | Custom | the union of its metrics' |

  So a Thrive outage says nothing on the Check-in group, and the almanac sheet
  being unreachable says nothing on Recovery. All three reads are still made on
  mount, because switching group must not cost a call.
- **The charts are not drawn until every read the group needs is `ready`.**
  #357's rule — the card is `PanelStatus` and nothing else until its read lands —
  one level up, and here it is stronger: a group is small multiples on one shared
  axis, and half a group is not a group. The heading, the group row, the controls
  and the caption all stay usable throughout.
- Sources are named once each, in the order Thrive, your almanac sheet. Only one
  line shows, by the order of that table. It is not `role="alert"`, for #351's
  reason.
- **An empty answer is `ready`.** A range with nothing in it is a quiet range,
  and the charts say so in their own words. Nothing here turns an empty result
  into an error, and nothing turns a refusal into a blank day (#350).

### Where a chart has nothing

Three different states, and they are not the same sentence:

| The metric | The plot says |
|---|---|
| Has values somewhere, none inside the range | No data in this range. |
| Has no value anywhere in the loaded history | Nothing recorded yet. |
| Its read is not `ready` | *Nothing — there are no charts yet; the status line is showing* |

Both strings are centred in the plot box at `--text-sm` in
`--color-text-secondary`, and the headline reads "—" with "no data in range"
under it. Neither is an error, and neither is drawn as a zero.

### The Fitness group, today

**Both of its metrics are `null` in live mode, and the group ships anyway.**

- **Training load** is `DailySummary!Q`, which exists today and is blank until the
  COROS sync (thrive#127) writes `DailyHealth`. This issue adds its mapping to
  `toHealth` — see [What this needs](#what-this-needs-from-350-351-352-and-357).
- **VO₂ max is not in `DailySummary` at all.** `DAILY_SUMMARY_FIELDS` is A–R and
  has no column for it; `DailyHealth` has it at K (`coros-sync-plan.md` §5). So
  it stays `null` even after the sync runs, until almanac can read the health
  grain — [thrive#147](https://github.com/luketmoss/thrive/issues/147) upstream,
  and [keel#364](https://github.com/luketmoss/keel/issues/364) for almanac's side
  of the swap. That read is a new `DataSource` method and is not this issue's.

Until then the group renders in full: the chips offer it, both cards draw with
their labels and units — "ml/kg/min · COROS" and "COROS", which is where a reader
learns whose numbers these are — the headline reads "—", and each plot says
"Nothing recorded yet.". **Not a hidden chip and not an error**: #357's rule that
a designed no-data state beats blocking, and #358's rule that nothing claims a
gap almanac was never told about. Demo mode shows the group full, so what it
looks like with data is never in doubt.

---

## What this needs from #350, #351, #352 and #357

One mapped field and one prop value. **No new `DataSource` method, no changed
signature, no new hook.**

- **#357, `src/data/liveHealth.ts`:** `toHealth` maps `training_load` from
  `DailySummary!Q` with #357's number rule — trim, `Number(...)`, `''` and
  non-finite to `null`, a genuine `0` stays `0`. #357 names this file as where
  `vo2max` and `training_load` join `Health` "when #359 wants them"; this is
  that. `vo2max` stays `null`.

  **#357's "a row with no health value at all gets no key" predicate does not
  change.** It stays the four fields #357 named — `steps`, `resting_hr`, `hrv`,
  `sleep_total_s` — because those are what "the watch had something" means on the
  day screen, where "not synced yet today" depends on it, and a `DailySummary`
  row carrying a training load and none of the four is not a shape the sync
  produces. Widening it would change #357's and #358's behaviour from inside this
  issue, which is the opposite of a seam.
- **#357, `src/panels/health/`:** the four rows pass the `href` #357 left
  unused — see [The day screen's rows](#the-day-screens-rows). `HealthRow`
  already becomes an `a` with a chevron when it has one; nothing in the component
  changes.
- **#350:** nothing. `Health` already declares `vo2max` and `training_load`, the
  three reads already exist, and the demo generator already produces everything
  this screen draws.
- **#351:** nothing. `useDayRead` already accepts all three read names and an
  arbitrary range, and `formatClock` and `formatHoursMinutes` are already
  exported.
- **#352:** nothing. `formatSleepHours` is used exactly as #352 specifies for the
  check-in's hours.
- **#358:** nothing. `CALENDAR_HISTORY_FLOOR` is imported as it stands.

### Environment

None. No new variable, and `VITE_THRIVE_APP_URL` is deliberately unused —
nothing on this screen links out of almanac. The one link it has goes to
almanac's own day screen.

---

## The day screen's rows

#357 left `HealthRow` an optional `href` that nothing passed, so that naming the
route from outside this issue would not settle it. This issue passes it:

| Row | Opens | Why that group |
|---|---|---|
| Sleep | `#/trends/sleep` | The Sleep group is sleep over time — the watch's nights, your own hours against them, and how you rated them |
| Resting HR | `#/trends/recovery` | Resting HR's own chart, beside HRV and sleep, which is how it is read |
| HRV | `#/trends/recovery` | The same group |
| Steps | `#/trends/activity` | Steps beside training time |

Each row becomes an `a` with the chevron #357 specifies, and nothing else about
either card changes. The link pushes a history entry, so Back returns to the day.

*A departure from the prototype*, whose `groupFor()` sends everything but steps,
weight and blood pressure to Recovery — including sleep. The Sleep group exists
precisely because sleep has a second measurement, and a reader tapping the sleep
row is asking about sleep, not about recovery.

**The check-in's own controls stay as they are.** They are inputs (#352), and a
row you are answering is not a row you navigate from. The Check-in group is one
tap away through the Trends tab.

---

## Demo mode

Everything works against #350's generated data, with no request leaving the page.
The generator already produces every field this screen draws, so this issue asks
nothing new of it:

| Metric | In the demo |
|---|---|
| Resting HR, HRV, Sleep (watch) | 371 days back through today, ~5% of nights not worn |
| Steps | past days only, so today is blank here as the design says it should be |
| Training time | completed workouts from 567 days back through yesterday |
| VO₂ max, Training load | every health day, including nights the watch was not worn — `build()` sets `h.vo2` and `h.load` outside its `worn` branch |
| Sleep quality, Energy, Hours slept | ~72% of the 80 days before today have an entry; within those, hours on ~85%, quality on ~90%, energy on ~88% |

Every state on the screen is reachable by moving the controls:

| State | Where |
|---|---|
| A full Recovery group with a band | 1M, 3M or 6M |
| Weekly training bars | 6M, 1Y or All |
| Daily training bars | 1W, 1M or 3M |
| The line breaking on blank days | any range, on the ~5% of nights not worn |
| Values far outside the band | the illness and camping spells the generator places |
| "No data in this range." | the Check-in group at 1Y — entries stop 80 days back |
| "Nothing recorded yet." | not reachable in demo mode; it is what live mode shows for VO₂ max and training load, and the suite covers it |
| "Building"-style gaps in the average | the first days after health history starts, at All |
| "Four at most — turn one off first." | Custom, after four |
| "Choose up to four metrics for this group." | Custom, with all four turned off |

The group, range, average, table and custom choices are held **in memory only**
in demo mode, per #350's rule that demo mode touches no storage, so a reload
starts at Recovery, 3M, 7d.

---

## Edge cases

- **Midnight in Denver with Trends open.** The `today` signal rolls over: every
  range's last day moves, the three keys gain a day and are read again once,
  yesterday becomes a plotted day for steps and training time, and the band is
  recomputed over the new 30 days. The group, range and average do not move.
- **A range longer than the data.** 1Y with four months of history draws four
  months of marks and eight months of empty axis, which is true. Nothing pads and
  nothing crops the axis to the data — the range is what you asked for.
- **All with nothing loaded yet.** There are no charts until the group's reads are
  ready, so `historyStart` is never computed from a partial answer.
- **All when every map is empty.** The span falls back to the last 30 days and
  every chart says "Nothing recorded yet.".
- **A 30-day average on a 1W range.** Seven points, each a real 30-day mean, from
  days the chart does not show. The caption says which average it is.
- **A 30-day average over a month the watch was off.** `rolling` needs half its
  window to have values, so the line simply stops rather than flattening across
  the gap.
- **Every value in the 30 days before today is the same.** The deviation is zero,
  the band is a line, and the chart draws it as a 1px-high rectangle rather than
  nothing.
- **Fewer than 14 values before today.** `yourRange` is `null`, no band is drawn,
  and the caption drops its band clause. The charts are otherwise unchanged —
  this screen never says "Building your range", which is the day screen's sentence
  about one day.
- **A day with a check-in but no watch data.** The compare chart shows a hollow
  dot with no line under it, and the levels charts show their dots. The Recovery
  group shows nothing for that day, which is right.
- **A day the watch has sleep for and you said nothing.** The compare chart shows
  the line and no hollow dot.
- **A check-in of 0 hours** is a real answer (#352): a hollow dot on the baseline,
  and "0 h" in the table.
- **Zero steps on a past day** is a genuine `0` (#356's parse rule, #357's row):
  a dot at zero, not a gap.
- **A day with two workouts.** Training time is their sum; the tooltip names both,
  comma-separated.
- **A workout with no moving time** contributes its elapsed time, which is what
  #356's card does with the same two fields.
- **A workout Thrive returns with an unknown type** never arrives: #356 drops
  those rows at the mapping.
- **A very long workout name** in the tooltip wraps; the tooltip never grows past
  `--tip-max-w`.
- **The range's first day is before Thrive's history.** Training time has no value
  there and the bars simply start where the history does, rather than showing a
  run of zeroes.
- **Switching group while a read is in flight.** The new group shows the status
  line for whatever it needs and nothing is read again; the call in flight serves
  both groups.
- **Rapid taps on the range buttons.** Each is a re-render from data already held
  and no call at all, so there is nothing to race.
- **Resizing the window, or rotating a tablet.** A `ResizeObserver` redraws each
  plot at the new width. Nothing remounts, no read is repeated, the group, range
  and crosshair are kept, and crossing 960px only changes how many columns the
  cards sit in.
- **Offline.** The heading, the groups, the controls, the caption and the table
  toggle all work; the three reads fail together and the one status line says so
  once, with **Try again**. No chart is drawn, because none of them can be.
- **Offline with data already on screen.** A background re-read that fails leaves
  what is showing and says nothing (#351), so the charts stay and stay usable.
- **The session has ended.** The screen stays usable, the status line says
  "Reconnect to load this.", and after Reconnect all three reads run again by
  themselves.
- **Live mode, now.** With `VITE_THRIVE_API_URL` empty, `readHealth` and
  `readWorkouts` are never attached, so Recovery, Activity and Fitness say
  "Thrive isn't connected yet." and the Check-in group works from the sheet.
  **Until thrive#144 ships**, the calls are refused and it reads "Couldn't load
  from Thrive." — the source is connected and is saying no, which is the correct
  thing to show (#353, #356, #357, #358).
- **Until the COROS sync (thrive#127) runs**, `readHealth` answers with rows that
  carry no health, which #357's mapping gives no key at all, so every health
  chart says "Nothing recorded yet." and the Check-in and training-time charts are
  unaffected. That is the honest state.
- **`prefers-reduced-motion: reduce`.** There is no animation on this screen to
  reduce: a chart redraw is a swap, not a transition, and a group change does not
  slide.

---

## Copy

| Where | String |
|---|---|
| Heading | Trends |
| Title | Trends · almanac *(#350)* |
| Group row label | Metric group |
| Groups | Recovery · Sleep · Activity · Fitness · Check-in · Custom |
| Control labels | Range · Average |
| Ranges | 1W · 1M · 3M · 6M · 1Y · All |
| Averages | Off · 7d · 14d · 30d |
| View toggle | Table · Charts |
| Caption | Jun 25, 2026 – Sep 23, 2026 · line = 7-day rolling average, dots = each day · shaded band = your range (mean ± 1 SD of the last 30 days). Blank days stay blank. |
| Caption, average off | … · line joins each day · … |
| Metric labels | Resting HR · HRV · Sleep (watch) · Steps · Training time · VO₂ max · Training load · Sleep: watch vs you said · Sleep quality · Energy · Hours slept (you said) |
| Units | bpm · ms · hours · min / day · ml/kg/min · COROS · COROS · your check-in |
| Headline label | average |
| Headline, compare | watch average · you said 7½ h |
| Headline, levels | Mostly Good · Good 41 · OK 22 · Poor 6 · not set 12 |
| Headline, none | — · no data in range |
| Change | ↓ 2 bpm vs previous 3 months · ↑ 14 min vs previous month |
| Change, tiny | same as previous week |
| Range words in the change | week · month · 3 months · 6 months · year |
| Key, training time in Recovery | context for the charts above |
| Key, a partial day | today isn't shown — the day isn't over |
| Key, compare | watch · you said |
| Levels | Poor · OK · Good — Low · OK · High |
| Plot, nothing in range | No data in this range. |
| Plot, nothing ever | Nothing recorded yet. |
| Tooltip hint, mouse | Click to open this day |
| Tooltip hint, touch | Tap again to open this day |
| Tooltip, no value | — |
| Chart label, heard | Resting HR, 3 months |
| Charts group label | Charts, Recovery |
| Table date column | Date |
| Table date | Tue, Sep 22, 26 |
| Table, no value | — |
| Table, compare | 7h 12m · you 7½ h |
| Custom picker label | Choose metrics |
| Custom, five | Four at most — turn one off first. |
| Custom, empty | Choose up to four metrics for this group. |
| Loading | Loading… |
| Not connected | Thrive isn't connected yet. |
| Error | Couldn't load from Thrive. · Couldn't load from your almanac sheet. · Couldn't load from Thrive and your almanac sheet. |
| Error, offline | You're offline — couldn't load from Thrive. |
| Error action | Try again |
| Session ended | Reconnect to load this. |

"Loading…", "Try again", "Reconnect to load this." and the not-connected and
error sentences are #351's `PanelStatus` wording with this screen's sources in
them, not new strings. Sentence case throughout, and **nothing on this screen is
a verdict**: it draws what happened and never rates it (spec §1, §9.10). The one
coloured thing, the headline's change, says a number and a direction and no more.

---

## Numbers

almanac is still the scaffold #350 will replace — `almanac/src` holds
`main.tsx`, `App.tsx`, `App.test.tsx`, `test-setup.ts` and an empty
`components/`, and there is no `.claude/launch.json` — so nothing in this note
could be measured against a running app. Every number is **unmeasured until
built**, and each comes from a source:

| Number | Source |
|---|---|
| The 960px breakpoint; touch targets ≥ 40px; rows ≥ 44px | design-language.md, § Layout and § Scale |
| 360px, the narrowest phone this is checked at, leaving a 328px column | #351, from #350's `--space-md` column padding |
| 7, 30, 91, 182, 365 days for the five fixed ranges | the prototype's `RANGE_DAYS` |
| 120 days, past which training time becomes weekly totals | design-language.md § Charts; the prototype's `chartBars` |
| 30 days and 14 values for the band | spec §9.8, via `RANGE_DAYS` and `RANGE_MIN_VALUES` in `src/data/range.ts` (#357) |
| The rolling average needs ⌈N/2⌉ of its window | the prototype's `rolling()` |
| Plot heights 156 / 132 / 118px | the prototype's `chartLine`, `chartBars`, `chartOrdinal`; the three tokens below |
| Plot gutters: 38px left, 44px right, 10px top, 24px bottom | the prototype's `frame()` — SVG geometry, not CSS, so stated here rather than tokenised |
| A 240px floor on the plot's width | the prototype's `drawCharts()` |
| Four y gridlines, stepped 1 / 2 / 5 / 10 × a power of ten | the prototype's `niceTicks()` |
| The seven date-tick rules and their label gaps (34, 16, 46, 46, 30, 30, 46px) | the prototype's `xTicks()` |
| Dot radius 3px to 31 days, 2.2px to 100, 1.5px beyond | the prototype's `dotR()` |
| A 2px line, a 4px end dot, a 2px `--color-surface` ring | design-language.md § Charts; #357's range dot uses the same ring |
| 1.5px ring on a "you said" dot | the prototype's `.youdot` |
| Bars at most 24px wide, `slot − 2px` otherwise, floor 1.5px | the prototype's `chartBars`, with the 2px surface gap this note adds |
| 8% of the span padded at each end of a y-scale | the prototype's `chartLine` |
| A minute, and half a unit, as the "same as" thresholds | the prototype's `chartStats()` |
| 300ms before "Loading…" | #351's `PanelStatus` |
| One call for `getDailySummary`, `getWorkouts` or the sheet over any range | #357, #356, #350 |
| 60 read requests a minute per user | the Google Sheets read quota, as #351–#358 cite it |
| A second or more per Apps Script call | implementation-plan.md § Risks |
| 371 / 567 / 80 days of demo data | #350's generator, from the prototype's `build()` |

**Will six group buttons fit a 360px phone?** No, by arithmetic, not measured,
which is why the row scrolls. #358 measured five Shade-by buttons plus a label at
about 430px against a 328px column; "Recovery", "Sleep", "Activity", "Fitness",
"Check-in" and "Custom" at `--text-sm` weight 600 plus `--space-sm` each side and
`--space-xs` gaps come to roughly 390px with no label at all. The controls row
below it wraps instead of scrolling, because two labelled segmented controls and
a button are three objects that read fine on two or three lines and a scroller
would hide the Table toggle.

**Will a y-axis label fit the 38px gutter?** At `--text-xs` (12px) a five-figure
label is about 30px, inside the gutter's 38px less its 6px of separation. That is
why steps are labelled "9k" rather than "9,412" and sleep "7h" rather than
"7h 12m" — the axis carries short forms and the headline, the crosshair and the
table carry the full ones.

**Is `--chart-dot` legible?** In dark mode, yes: `#6D737B` on `--color-surface`
`#1A1A1E` is **3.63:1**, over the 3:1 WCAG 1.4.11 minimum for a graphical object.
**In light mode it is 2.45:1** — `#A0A6AE` on `#FFFFFF` — and fails it. Every
per-day dot on every line chart is drawn in that colour whenever a rolling
average is on, which is the default, so this is the screen's main data mark
falling under the minimum. It is a value in the standing document, not in this
note, so it is not changed here: **[keel#363](https://github.com/luketmoss/keel/issues/363)**
proposes the amendment (`#868C93` measures 3.39:1 on white and keeps the same
recessive reading), and this screen uses `--chart-dot` as the design language
defines it, whatever value that is. Computed with the WCAG relative-luminance
formula from the document's own hex values, as #358 computed its ramp.

`/test` checks the tap targets, the two-column layout, the chart heights, the
mark colours and the crosshair's alignment across a group in the running app, in
demo mode, with `getBoundingClientRect()` and `getComputedStyle()` at a
360px-wide viewport and at 960px — the widths #351–#358 already check at.

---

## New tokens

The design language, #350, #351, #352, #353, #356, #357 and #358 have no token
for these six. Each value comes from the source named, and `global.css` defines
it on `:root` like the rest.

| Token | Value | For | Source |
|---|---|---|---|
| `--chart-h` | `156px` | a line or compare chart's plot box, including its date axis | prototype `chartLine`, `chartCompare` |
| `--chart-h-bar` | `132px` | the training-time bars' plot box. Shorter because it starts at zero and carries no band | prototype `chartBars` |
| `--chart-h-level` | `118px` | a three-row levels chart's plot box | prototype `chartOrdinal` |
| `--tip-min-w` | `170px` | the crosshair tooltip's minimum width | prototype `.tip` |
| `--tip-max-w` | `250px` | its maximum, so a long workout name wraps rather than widening it | prototype `.tip` |
| `--table-max-h` | `62vh` | the table view's scroll box, so its header can stick | prototype `.table-wrap` |

**No new colours.** `--chart-grid`, `--chart-axis`, `--chart-dot`,
`--color-band`, `--color-primary`, `--color-surface`, `--color-sunken`,
`--color-text`, `--color-text-secondary`, `--color-text-muted`,
`--color-success`, `--color-warning`, `--color-border`, `--color-border-light`,
`--shadow-sm` and `--shadow-lg` are all the design language's or #350's, used for
exactly what they name. The chart chrome tokens — `--chart-grid`, `--chart-axis`,
`--chart-dot` — were added to the standing document for this screen and are used
here for the first time.

**One new icon**, `table`, from the prototype's set, for the view toggle's
charts-showing state. `chart`, its other state, is already in the app as #350's
Trends tab icon. `up`, `down` (#357), `info`, `check` (#353) and `alert` (#350)
are the only others this screen uses.

Sizes the prototype uses off the scale are brought onto it instead of getting
tokens, as every note before this one did: the chart text's 10.5px becomes
`--text-xs`, the card's 12px padding `--space-sm`, the `.filters` 8px/14px gaps
`--space-sm` and `--space-md`, the `.segd` 3px padding and 2px gaps
`--space-xs`, the `.tc-key` 4px/12px gaps `--space-xs` and `--space-md`, the
tooltip's 10px/12px padding `--space-sm`, the table's 8px/12px cell padding
`--space-sm` and `--space-md`, the segment buttons' 32px minimum height the
design language's 40px, and the `.trend-grid` 12px gap `--space-sm`.

---

## What #354 will add, and what it will not change

- **Two groups** — Body (weight, body fat) and Blood pressure — as two more
  buttons in the group row and two more names `isTrendGroup` accepts, at which
  point `#/trends/body` and `#/trends/bp` stop falling through.
- **Three metrics** in the catalogue — `weight`, `fat` and `bp` — and the first
  two in the custom set, which the prototype's `CUSTOMABLE` already lists.
- **One new chart kind**, the blood-pressure bar: a thin bar per day from
  diastolic to systolic with reference lines at 80 and 120 in `--chart-axis`
  (design-language.md § Charts; the prototype's `chartBP`). It is the only part
  of § Charts this issue does not implement, and it is left whole rather than
  half-built.
- **Nothing else.** The route, the controls, the caption, the crosshair, the
  tooltip, the table and the status line are all metric-agnostic by construction:
  a group is a list of metric keys, and a metric is a row in one catalogue.
