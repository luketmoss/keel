# 358 — Calendar: a month of days, and a way back into any of them

Tokens are from the standing [design-language.md](design-language.md), the ones
#350, #351, #352, #353, #356 and #357 added are in
[350-foundation.md](350-foundation.md#new-tokens),
[351-day-screen.md](351-day-screen.md#new-tokens),
[352-check-in-and-journal.md](352-check-in-and-journal.md#new-tokens),
[353-todo-panel.md](353-todo-panel.md#new-tokens),
[356-training-panel.md](356-training-panel.md#new-tokens) and
[357-health-panels.md](357-health-panels.md#new-tokens), and the ones this issue
adds are under [New tokens](#new-tokens). The spec is [../spec.md](../spec.md)
(§1, §2, §4, §5, §9.2, §9.3, §9.8, §9.9, §9.10, §9.13). The behavioural
reference is the prototype, [../prototype.html](../prototype.html):
`viewCalendar()`, `calCell()`, `calSummary()`, `quartiles()`, `binOf()`,
`shiftMonth()`, the `#calGrid` swipe, and the `.cal-*`, `.chips`, `.heat-*`,
`.scale`, `.kv` and `.mini*` rules. Where the prototype and the design language
disagree, the design language wins, and this note says where that happened — and
it says, once, where this note departs from the design language too.

This note builds on seven settled seams:

- **#350's frame and data interface** — the Calendar tab, the router's
  "first segment picks the tab, the rest goes to the screen unparsed" rule,
  `getDataSource()`, the day-keyed reads, the `session` signal, and demo mode's
  rule that neither `localStorage` nor `sessionStorage` is touched.
- **#351's day screen** — `dayHref(date)` for **Open day**, the `today` signal,
  `dayStateOf`, `DayRead` as the shape a read's status takes, `PanelNote`,
  `--today-ring` (reserved for this screen by name), the swipe thresholds, and
  `TodayControl`, whose show condition #351 says this issue extends.
- **#352's entry rules** — a journal dot is `notes !== null`; what the screen
  reads is the sheet, so a change still unsaved on the day screen is not in it,
  and a cached month goes stale when a save lands.
- **#353's Hive reads** — `readHiveDue` answers "what is open and due on these
  dates, as of now", never "what was due then", so a past day wants
  `readHiveCompleted` instead.
- **#356's Thrive reads** — `readWorkouts` is one call for any range, and
  `readWorkoutPlans` is not for this screen.
- **#357's health work** — `readHealth` is one call for any range, and
  `src/data/range.ts` is imported unchanged for `RANGE_MIN_VALUES`.
- **#355's client** — the mapping from a refusal onto a `DayRead`, and the
  source words "Thrive" and "Hive".

**Nothing in `useDayRead`, `DataSource`, `src/day/` or any panel's folder
changes.** Everything new is in `src/calendar/`.

Nothing in this note exists yet to measure. See [Numbers](#numbers).

---

## The route

The Calendar tab gets whatever path segments follow `calendar` (#350).

| Path | Shows | URL |
|---|---|---|
| `#/calendar` | The month containing today in Denver | stays |
| `#/calendar/YYYY-MM`, a month `isIsoMonth()` accepts | That month | stays |
| `#/calendar/YYYY-MM` that happens to be today's month | That month | stays as written |
| Anything else: `#/calendar/2026-13`, `#/calendar/2026-7`, `#/calendar/foo`, `#/calendar/2026-09/x` | Today's month | replaced with `#/calendar`, no new history entry |

`#/calendar` means "the month I am in", exactly as #351's `#/` means "today",
and for the same reason: a link that keeps working tomorrow is worth more than
one that pins a month nobody asked to pin. #350's tabs link to `#/calendar`, so
the tab and the URL agree and a repeated tap is a no-op rather than a loop.

`src/calendar/routes.ts` holds the small vocabulary:

```ts
export type IsoMonth = string;                       // 'YYYY-MM'
export function isIsoMonth(value: string): boolean;  // a real month, 01–12
export function monthOf(date: IsoDate): IsoMonth;
export function calendarHref(month: IsoMonth, today: IsoDate): string;
export function parseCalendarPath(rest: string[], today: IsoDate): { month: IsoMonth; replace: boolean };
export function gridRange(month: IsoMonth): { from: IsoDate; to: IsoDate; days: IsoDate[] };
```

- **`calendarHref`** is `#/calendar` when `month` is today's month and
  `#/calendar/YYYY-MM` otherwise — `dayHref`'s shape, one unit up.
- **`gridRange`** gives the whole visible grid, not the month: `from` is the
  Monday of the week holding the 1st, `to` is the Sunday of the week holding the
  last day, and `days` is the 28, 35 or 42 dates between them. Every read on this
  screen uses it, so the leading and trailing days carry real marks rather than
  being blank stubs of the neighbouring months.
- **Moving between months replaces the history entry**; it never pushes one.
  Swiping back through ten months and pressing Back returns to wherever you were
  before the Calendar, not to the ninth month — #351's rule for days, unchanged.
  Arriving at the Calendar from another tab or a link still pushes (#350).
- **Document title:** "Calendar · almanac" (#350's, unchanged) when today's month
  is showing, and "September 2026 · almanac" for any other month.
- **Today follows Denver**, through #351's `today` signal. At midnight the month
  heading does not move, but today's ring does, the past/future split in the
  summary does, and two read keys change (below).

---

## The screen, top to bottom

Phone, below 960px, on September 2026 with the 12th selected:

```
┌─────────────────────────────────┐
│ ⬡ almanac                  (👤) │  top bar (#350); Today control when
├─────────────────────────────────┤  the month showing isn't today's
│ September 2026            ‹   › │  heading, Previous month, Next month
│ SHADE BY (Nothing)(Sleep)(Rest… │  a scrolling row of choices
│  M   T   W   T   F   S   S      │
│ ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐    │
│ │31││ 1││ 2││ 3││ 4││ 5││ 6│    │  the 31st is August's: muted, no fill
│ │  ││🚲││  ││🏋││  ││  ││ •││    │
│ └──┘└──┘└──┘└──┘└──┘└──┘└──┘    │
│  … four more weeks …            │
│ 6h 12m ▢▢▢▢ 9h 04m  ▨ no data   │  the scale, when a metric is chosen
│ Shading splits every day from   │
│ Sep 15, 2025 into four equal …  │
│ 🏋Strength 🚲Ride ⛰Hike 🏃Run … │  the legend
│ • Journal entry  🏋Planned      │
│ ┌─────────────────────────────┐ │
│ │ Saturday, Sep 12  Open day ›│ │  the day summary
│ │ Sleep 7h 12m  Resting HR 52 │ │
│ │ HRV 38 ms     Steps 9,412   │ │
│ │ Energy High                 │ │
│ │ 🚲 Mountain Bike            │ │
│ │ ✓ 2 Hive items completed    │ │
│ │ Rode the ridge before work… │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│    Day     Calendar    Trends   │  bottom bar (#350)
└─────────────────────────────────┘
```

Wide, 960px and up:

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⬡ almanac        ( Day | Calendar | Trends )                   (👤)   │
├──────────────────────────────────────────────────────────────────────┤
│ September 2026                                              ‹    ›    │
│ SHADE BY (Nothing)(Sleep)(Resting HR)(HRV)(Steps)                     │
│ ┌──────────────────────────────────────┐  ┌────────────────────────┐  │
│ │  M    T    W    T    F    S    S     │  │ Saturday, Sep 12       │  │
│ │ ┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐  │  │             Open day › │  │
│ │ …five or six rows of cells…          │  │ Sleep 7h 12m           │  │
│ │ └───┘└───┘└───┘└───┘└───┘└───┘└───┘  │  │ …                      │  │
│ │ 6h 12m ▢▢▢▢ 9h 04m   ▨ no data       │  └────────────────────────┘  │
│ │ Shading splits every day from …      │                              │
│ │ 🏋Strength 🚲Ride ⛰Hike 🏃Run …      │                              │
│ └──────────────────────────────────────┘                              │
└──────────────────────────────────────────────────────────────────────┘
```

From 960px the screen is a two-column grid, `minmax(0, 1.5fr)` for the grid
column and `minmax(0, 1fr)` for the summary, `--space-lg` apart, top-aligned
(the prototype's `.cal-layout`). Below 960px it is one column and the summary
follows the grid with `--space-md` above it.

**The DOM order is the grid then the summary at both widths**, so unlike #351's
panel area there is no media-query signal and nothing remounts when the layout
crosses 960px. The reads and the cache do not care about the width at all.

### Header

One row, `--space-sm` above it:

- **The month**, "September 2026": the page's only `h1`, `--text-2xl`, weight
  700, `--color-text`, with `tabindex="-1"` so focus can be moved to it.
- At the right, `--space-xs` apart, **Previous month** and **Next month**: each a
  chevron at `--icon-md` in `--color-text-secondary`, centred in a square
  `--icon-btn-size` target with `--radius-full`; hover fills it with
  `--color-sunken` and turns the chevron `--color-text` — #351's header buttons,
  unchanged.

There is no relative pill and no sun line. Those belong to a day.

### The Today control

`TodayControl` (#351, `src/day/TodayControl.tsx`) already shows in the top bar
while the Day tab is current and the date showing isn't today. #351 reserves the
extension; this is it:

> It shows while **the Day tab is current and the date showing isn't today**, or
> **the Calendar tab is current and the month showing isn't today's month**.
> Its target is `dayHref(today)` on the Day tab and `calendarHref(monthOf(today),
> today)` — that is, `#/calendar` — on the Calendar tab.

Both halves are derived from #350's `route` signal and #351's `today` signal, so
the control needs nothing from this screen and this screen publishes nothing for
it. Everything else about it — the look, the ≥40px height, the focus move when
it disappears — is #351's and unchanged.

Activating it on the Calendar goes to today's month and, by the selection rule
below, selects today. It does not leave the Calendar: the tab you are on is the
question you are asking, and "today" is an answer in both of them.

### Shade by

A row under the header, `--space-sm` above and `--space-md` below: the label
**SHADE BY** at `--text-xs`, weight 700, upper case, `--tracking-caps`,
`--color-text-secondary`, then five toggle buttons in a `role="group"` labelled
"Shade days by".

| Button | `ShadeChoice` |
|---|---|
| Nothing | `none` |
| Sleep | `sleep` |
| Resting HR | `rhr` |
| HRV | `hrv` |
| Steps | `steps` |

Each is #352's choice-button treatment exactly: at least 40px tall,
`--space-sm` padding at the sides, `--radius-full`, `--text-sm` weight 600, with
`aria-pressed`; unselected is `--color-surface` with a 1px `--color-border`
border and a `--color-text-secondary` label, hover turns the border
`--color-text-muted`, selected is `--color-primary-light` fill, a 1px
`--color-primary` border with a second inset 1px ring, and a `--color-primary`
label at weight 700, and keyboard focus is `--focus-ring`. Exactly one is
pressed at all times; tapping the pressed one does nothing (there is no "clear"
here — `Nothing` is the cleared state, and it is a button of its own).

**The row scrolls sideways** at narrow widths: the label and five buttons need
about 430px and a 360px phone leaves 328px (see [Numbers](#numbers)). It bleeds
to the viewport edges — `--space-md` negative margins with `--space-md` padding
— has no visible scrollbar, and scrolls the pressed button into view when the
screen mounts. *A departure from #352's equal-width choices,* which suit three
words of similar length in a row that must fit; these five are a filter, they
differ in length, and a scroller keeps them one tap each.

**The choice is remembered on the device**, in `localStorage` under
`almanac:calendar` as `{"shadeBy":"rhr"}`. It is a view control, not a setting
(spec §9.2, §9.10, the same rule Trends' range and average follow), so §5's "no
settings surface" still holds. An unreadable, missing or unrecognised value is
`none`. **In demo mode it is held in memory for the page's life and nothing is
stored**, because #350 says demo mode neither reads nor writes storage.

---

## The grid

`role="grid"`, labelled by the month heading, in `src/calendar/Grid.tsx`. Seven
equal columns, `--space-xs` apart, spanning the grid column's width:

- **A header row** of seven `role="columnheader"` cells, Monday first, each the
  weekday's letter (M T W T F S S) at `--text-xs`, weight 700,
  `--tracking-caps`, `--color-text-secondary`, centred, with `aria-label` giving
  the full weekday name.
- **Four to six `role="row"`s** of seven cells each, from `gridRange().days`.

*A departure from #351's week strip,* which is seven buttons with `aria-pressed`
in a `role="group"`. Seven buttons in a line are a group; 42 in seven columns
are a grid, and a grid is the pattern that gives arrow-key movement and "row 3,
column 6" for free. The day screen's strip is unchanged.

### A day cell

A `button` with `role="gridcell"`, at least `--cal-cell-min-h` tall with
`aspect-ratio: 1 / 1.1`, `--space-xs` padding, `--radius-md`, a 1px
`--color-border-light` border and a `--color-surface` fill, holding two things in
a column with `justify-content: space-between`, plus one absolutely positioned
dot:

```
┌────────────┐
│ 12       • │   the day of the month, top left; the journal dot, top right
│            │
│ 🚲 🏋      │   the marks row, bottom left
└────────────┘
```

- **The day of the month** at `--text-sm`, weight 650, `tabular-nums`, `line-height: 1`.
- **The marks row** — see [Marks](#marks).
- **The journal dot** at `--cal-note-size` across, `--radius-full`, in
  `--color-primary`, inset `--space-xs` from the top and right corners,
  `aria-hidden`. It is there exactly when that date's entry has
  `notes !== null` (#352).

| State | Look |
|---|---|
| Default | As above |
| Hover | Border turns `--color-text-muted` |
| A leading or trailing day (another month's) | No fill, no border, no shading; the number, marks and dot all in `--color-text-muted` |
| Today | `--today-ring` (#351 reserved it for this screen), and `aria-current="date"` |
| Selected | `outline: 2px solid var(--color-text)` with a 1px offset, and `aria-selected="true"` |
| Shaded | See [Shading](#shading) |
| Keyboard focus | `--focus-ring` |

Today's ring and the selected outline are different colours, different widths and
on different sides of the cell's edge, so a day that is both wears both and reads
as both. A focused cell adds `--focus-ring` outside those again. Neither the ring
nor the outline carries meaning alone: today has `aria-current` and the selection
has `aria-selected`.

**The accessible name** is the full date, then the day's workouts, then its
journal entry, then the shading metric's value — the prototype's, with the
metric added:

- "Saturday, September 12"
- "Saturday, September 12, Mountain Bike, planned Stretch"
- "Saturday, September 12, Mountain Bike, journal entry"
- "Saturday, September 12, Mountain Bike, journal entry, resting HR 52 bpm"
- "Tuesday, September 15, no resting HR"

The year is left out: every cell in a grid is within a month of the heading,
which carries it. The number, marks and dot are `aria-hidden`; the name says all
of it. **The metric's value is in the name because the shading is colour alone on
screen** — the design language's "never colour alone" rule, answered the way
#357 answers it for the range bar: the words say what the colour says. Sighted
readers get the same fact by selecting the day, whose summary lists all four
metrics.

### Marks

- **What they are:** the day's Thrive workouts, as workout **type icons** — not
  coloured dots. Thrive's `.badge-*` colours fail colour-blind separation as bare
  dots (weight red and run rose are close), which is why the design language's
  § Data colours sends the calendar to icons.

  | `Workout.type` | Icon | Legend word |
  |---|---|---|
  | `weight` | `dumbbell` | Strength |
  | `bike` | `bike` | Ride |
  | `hike` | `mountain` | Hike |
  | `run` | `run` | Run |
  | `walk` | `walk` | Walk |
  | `stretch` | `stretch` | Stretch |

  Icons are `--icon-xs` (#357's token) in `--color-text-secondary`, 0 apart, with
  no wrapping. A **planned** workout's icon is drawn at `opacity: .5` — the
  prototype's `.cal-icons .plan`. A past day's planned workout that never
  happened stays dimmed; "Planned · not done" is #356's card's job, and the grid
  only says it wasn't done.
- **Order:** done first, then planned — #351's week-strip order, so the two
  surfaces agree.
- **At most two marks**, on one line. One workout is one icon; two are two
  icons; **three or more are one icon and "+n", where n is the count less the
  one icon shown** — "+2" for three workouts. "+n" is at `--text-xs`, weight
  700, `tabular-nums`, `--space-xs` after the icon.

  *The issue said "up to two icons, then +n", and the arithmetic says it does not
  fit.* At 360px a cell is about 43px wide, leaving about 35px inside its
  padding; two `--icon-xs` icons and a "+1" at `--text-xs` need about 39px. The
  choices were to let the row wrap, which makes that whole week of the grid
  taller for every day with three workouts — a bike and a lift on the same day is
  ordinary here — or to spend the second mark on the count. The count is the more
  useful of the two, because it is the thing you cannot infer, and the
  acceptance criterion in the issue body was corrected to match. See
  [Numbers](#numbers).
- The marks row keeps its height on a day with no workouts, so the grid does not
  jump as a month's reads land.

### Selection

**A day is selected at all times.** The summary is a column of the screen from
960px and the last thing on it below that, and a screen with an empty column is
worse than one that shows you a day you did not ask for. The prototype's "Pick a
day to see its summary." is therefore not in this design.

- **On opening the screen, and whenever the month changes:** today, when the new
  month is today's month; otherwise the same day of the month as was selected,
  clamped to the new month's last day (31 August → 30 September).
- **Tapping or clicking a cell** selects that day. Tapping a leading or trailing
  day selects it **and** moves to its month, replacing the URL — after which the
  same day is still selected, because it is in the new month.
- The selection is the screen's state, not the route. `#/calendar/2026-09` means
  a month; which day you are looking at inside it is not worth a history entry
  and not worth a link.

### Moving between months

| Input | Moves | Where |
|---|---|---|
| Swipe the grid left / right | Next month / previous month | Touch and pen only |
| **Previous month** / **Next month** | One month back / forward | Any pointer, and keyboard |
| PageDown / PageUp | One month forward / back | Keyboard, inside the grid |
| ← → ↑ ↓ past the shown month's edge | The neighbouring month | Keyboard, inside the grid |
| Tap a leading or trailing day | That day's month | Any pointer |
| **Today** in the top bar | Today's month | Shown only away from today's month |

**Swipes** follow #351's rule exactly: the pointer moves more than 60px
sideways, the sideways travel is more than 1.6 times the vertical, and it takes
under 900ms; touch and pen only, never a mouse; the grid is `touch-action: pan-y`
with no text selection; and for 350ms after a swipe the click that ends it is
swallowed, so a swipe that starts on a cell does not also select it. Whether
`/develop` shares one helper with the day screen's handler or writes the
calendar's own is its call; the rule is the same either way and the three numbers
have one source.

**Keys, inside the grid.** The grid is one tab stop: the selected cell has
`tabindex="0"` and every other cell `-1`, and the selection moves with the keys
(the roving-tabindex grid pattern).

| Key | Moves the selection |
|---|---|
| ← / → | One day back / forward |
| ↑ / ↓ | One week back / forward |
| Home / End | That week's Monday / Sunday |
| PageUp / PageDown | One month back / forward, keeping the day of the month, clamped |

A move past the shown month's edge moves the month with it and keeps focus on
the newly selected cell. `t` or `T`, anywhere on the Calendar screen, goes to
today's month and selects today — #351's key, on this screen's terms, with
#351's three exclusions unchanged: not while focus is in an `input`, `textarea`,
`select` or anything `contenteditable` or inside an open `role="menu"`, not with
Ctrl, Alt or Meta held, and not on a repeat from a held key. `t` when today is
already selected does nothing.

---

## Shading

Spec §9.3 and the design language's § Data colours: one hue, four equal-count
groups **over all history**, a hatch for days with no data, and a legend with the
lowest and highest values.

### The metrics

`src/calendar/shading.ts`:

```ts
export type ShadeMetric = 'sleep' | 'rhr' | 'hrv' | 'steps';
export type ShadeChoice = 'none' | ShadeMetric;

export interface Groups { q1: number; q2: number; q3: number; min: number; max: number; n: number }

export function groupsOf(values: number[]): Groups | null;
export function bandOf(value: number, groups: Groups): 1 | 2 | 3 | 4;
export function firstValueDate(data: Map<IsoDate, Health>, metric: ShadeMetric): IsoDate | null;
```

| Metric | Button | Value from `Health` | Shown as | The word in the caption |
|---|---|---|---|---|
| `sleep` | Sleep | `sleep_total_s / 3600`, `null` when the field is | `formatHoursMinutes` (#351): "7h 12m" | sleep |
| `rhr` | Resting HR | `resting_hr` | "52 bpm" | resting HR |
| `hrv` | HRV | `hrv` | "38 ms" | HRV |
| `steps` | Steps | `steps` | `toLocaleString('en-US')`: "9,412" | steps |

These are the four the design language gives a range bar and spec §9.8 names, and
they are the four the day screen already shows. `calories`, VO₂ max and training
load are not offered: the first is a total nobody compares days by, and the other
two are #359's when `toHealth` starts mapping them.

### The groups

- **`groupsOf`** sorts the values and takes the prototype's order statistics:
  `q(p) = sorted[Math.floor(p * (n − 1))]` at p = .25, .5 and .75, plus `min`,
  `max` and `n`. It returns `null` below `RANGE_MIN_VALUES` — 14, imported from
  `src/data/range.ts` (#357) rather than retyped, because it is the same floor
  the day screen applies before it will draw a comparison at all, and four groups
  over ten days is four groups of two or three.
- **`bandOf`** is `value <= q1 ? 1 : value <= q2 ? 2 : value <= q3 ? 3 : 4`.
- **"Equal-count" is as equal as ties allow.** Repeated values — a week of
  exactly 8,000 steps — land in one band together, so a band can hold more than a
  quarter of the days. That is right: two days with the same number must never be
  shaded differently.
- **The date itself is in its own groups,** unlike `valuesBefore` (#357), because
  this is a description of the whole history rather than a comparison against the
  days before one date.

### What is shaded, and what is hatched

With a metric chosen and `groupsOf` returning groups, for every cell:

| The day | Cell |
|---|---|
| Before the metric's first value | No fill, no hatch |
| From that date through today, with a value | Filled from the band `bandOf` gives |
| From that date through today, with no value | `--cal-hatch` |
| After today | No fill, no hatch |
| A leading or trailing day (another month's) | No fill, no hatch |

**Days before the first value are plain, not hatched.** A hatch says "the watch
had nothing that day"; before COROS history begins there was no watch, and
hatching a year of 2024 would claim a gap in a series that had not started.
`firstValueDate` is the earliest key in the all-history read that has a value for
the chosen metric, so this is answered from the data rather than from a constant
— which is the improvement on the prototype's `H_START`, a constant live mode has
no way to know. The prototype's own note that "COROS history starts Sep 15, 2025"
was dropped from #357 for exactly that reason; here the same fact falls out of
the read.

**The out-of-month cells are never shaded** even when they have values. They are
context for the week, not part of the month being read, and the prototype does
the same.

### The colours

The design language's § Data colours: `--color-primary` mixed into
`--color-surface` at 16%, 36%, 62% and 90%, as `--cal-shade-1` … `--cal-shade-4`.

**The one place this note departs from the design language: in dark mode the
third step is 70%, not 62%.** At 62% the dark fill is `#866AAA`, whose relative
luminance (0.183) sits in the dead zone where neither `--color-text` (3.74:1) nor
`--color-onvprimary` (4.05:1) reaches AA, so a whole quarter of the days would
carry an illegible date. At 70% the fill is `#9474BC` and `--color-on-primary`
measures 4.76:1. Light mode keeps 62% unchanged, where the fill is `#AD88DA` and
`--color-text` measures 5.74:1. The cost is a slightly less even dark ramp; the
alternative was an unreadable band. All four values and their contrasts are in
[New tokens](#new-tokens), and the standing document should absorb the dark
exception rather than this note keeping it.

**The cell's ink follows the fill.** On an unshaded, hatched, band-1 or band-2
cell everything is as it is anywhere else — the number in `--color-text`, the
marks in `--color-text-secondary`, the journal dot in `--color-primary`. On the
two strong bands, the number, the marks, the "+n", the journal dot **and today's
ring** all take one ink:

| Band | Light | Dark |
|---|---|---|
| 3 | `--cal-ink-3` = `--color-text` | `--cal-ink-3` = `--color-on-primary` |
| 4 | `--cal-ink-4` = `--color-on-primary` | `--cal-ink-4` = `--color-on-primary` |

The flip lands in a different place in each theme because the ramp runs pale to
deep in light and deep to pale in dark: the ink changes when the fill stops
reading as a tinted surface and starts reading as a primary fill. Every
combination is measured in [Numbers](#numbers), including the ones that forced
the rule — `--color-primary` on light band 3 is 2.18:1 and `--color-text` on
light band 4 is 3.23:1, so neither the dot nor the number could simply stay put.
A shaded cell's own 1px border becomes `transparent`; the fill is the cell's
edge, and the `--space-xs` gap keeps neighbours apart.

*The prototype flips at bands 3 and 4 in both themes, to `--on-primary`.* That is
what the measurements above reject for light band 3.

### The scale and the caption

Directly under the grid, `--space-sm` above, when a metric is chosen and its
groups exist:

```
6h 12m  ▢ ▢ ▢ ▢  9h 04m       ▨ no data
Shading splits every day from Sep 15, 2025 into four equal groups.
More colour means a higher sleep, not better or worse.
```

- One row at `--text-xs` in `--color-text-secondary`, wrapping: the **lowest**
  value, four `--cal-swatch-w` × `--cal-swatch-h` swatches with `--radius-xs`
  corners and a 1px `--color-border-light` border, one per band in order, the
  **highest** value, then `--space-sm` away a hatched swatch and "no data".
  Values are formatted by the metric, per the table above.
- The caption follows at `--text-xs` in `--color-text-secondary`, `--space-xs`
  above: "Shading splits every day from **Sep 15, 2025** into four equal groups.
  More colour means a higher **sleep**, not better or worse." The date is
  `firstValueDate` in "Sep 15, 2025" form; the word is the metric's.
- *"More colour", not the prototype's "Darker".* In dark mode the ramp runs from
  near-black to lavender, so "darker" is the wrong way round in half the app.
- **"not better or worse"** is the point of the sentence and is not optional:
  spec §1 — almanac shows and never concludes. A dark cell on the HRV shading is
  a high HRV, not a good day.

The scale is `aria-hidden`; the caption is not, and it plus the per-cell values
in each cell's accessible name is the whole of the shading for a screen reader.

### While the shading has nothing to say

| Situation | Cells | Under the grid, in place of the scale |
|---|---|---|
| Shade by **Nothing** | Plain | Nothing |
| The health read is `loading` | Plain | Nothing for the first 300ms, then "Loading…" in `--color-text-muted`, `role="status"` |
| It is `error`, `session-expired` or `not-connected` | Plain | Nothing here — the status line under the grid says it once, for every read |
| It is `ready` with fewer than 14 values | Plain | "Not enough sleep yet to shade — needs 14 days." |
| It is `ready` with 14 or more | Filled and hatched | The scale and the caption |

**Nothing is hatched while the read is unfinished or refused.** The hatch means
"the watch had nothing for this day"; drawing it before an answer has arrived, or
when the answer was a refusal, says something almanac does not know. Plain cells
say nothing, which is true. This is #350's "absent is not an empty day" rule, one
level up and at the level of a pattern rather than a panel.

---

## The day summary

`DaySummary` in `src/calendar/DaySummary.tsx`. A card — `--color-surface`, a 1px
`--color-border` border, `--radius-md`, content clipped to the corners — built
like #351's `Panel` but with its own header, because its title is a date rather
than a section name.

```
┌──────────────────────────────────────────────┐
│ Saturday, Sep 12                  Open day › │
│ Sleep        Resting HR   HRV      Steps     │
│ 7h 12m       52 bpm       38 ms    9,412     │
│ Energy                                       │
│ High                                         │
│ 🚲 Mountain Bike                             │
│ 🏋 Planned, not done: Upper Push A           │
│ ✓ 2 Hive items completed                     │
├──────────────────────────────────────────────┤
│ Rode the ridge before work. Legs fine, head  │
│ better.                                      │
└──────────────────────────────────────────────┘
```

- **Header:** one row, at least `--icon-btn-size` tall, `--space-xs` padding top
  and bottom, `--space-md` at the left and `--space-sm` at the right. The date as
  an `h2` at `--text-base`, weight 700, `--color-text` — "Saturday, Sep 12", the
  long weekday with the short month. Then, pushed right, **Open day**.
- **Open day** is an `a` to `dayHref(date)` (#351), styled as #351's
  `PanelAction` — `--text-sm` weight 700 in `--color-primary`, at least 40px
  tall, `--space-sm` padding at the sides, `--radius-full`, `--color-primary-light`
  on hover — with the `chevR` icon at `--icon-sm` **after** the label instead of
  before it, because it points where it goes. Following it pushes a history entry
  (#350: arriving at a tab from another one pushes), so Back returns to the
  Calendar on the same month.
- **The values** are a `dl` in a `repeat(auto-fill, minmax(96px, 1fr))` grid,
  `--space-sm` and `--space-md` apart, `--space-md` at the sides: each term at
  `--text-xs` in `--color-text-secondary` over its value at `--text-base` weight
  650 with `tabular-nums`. Each pair appears only when it has a value.

  | Term | Value | From |
  |---|---|---|
  | Sleep | "7h 12m" | `Health.sleep_total_s` |
  | Sleep (you said) | "7½ h" | `Entry.sleep_hours` via `formatSleepHours` (#352), **only** when the watch has no figure |
  | Resting HR | "52 bpm" | `Health.resting_hr`, rounded |
  | HRV | "38 ms" | `Health.hrv`, rounded |
  | Steps | "9,412" | `Health.steps` |
  | Energy | "High" | `Entry.energy` |

  Watch and self-report never merge (spec §6): the check-in's hours stand in only
  when the watch has nothing, and they are labelled where they stand.
- **The activities** follow, one row each at `--text-sm` in `--color-text`,
  `--space-sm` apart, `--space-md` at the sides: the type icon at `--icon-sm` in
  `--color-text-secondary`, then the workout's name, prefixed "Planned: " on
  today or a future day and "Planned, not done: " on a past day (#356's two
  states, in words rather than badges).

  **No distance, duration or effort.** #356's Training card is one tap away and is
  where the numbers live; half-repeating them here would give the same ride two
  formats to disagree in. *A departure from the prototype,* which shows moving
  time and distance.
- **One Hive line**, in the same row shape, only when the count is not zero:
  - a day **before today**: the `check` icon and "2 Hive items completed" — the
    day's `readHiveCompleted` entries, deduped as #353 dedupes them (one row per
    item, the last completion of the day), reopened ones included, since the day's
    record says they were completed;
  - **today or later**: the `clock` icon and "3 Hive items due" — the day's
    `readHiveDue` entries.
  - Singular at one: "1 Hive item completed", "1 Hive item due".
  - **Counts, not links.** The rows that open Hive are #353's, and they are what
    **Open day** leads to.
- **The journal entry** last, if any: a block with a 1px `--color-border-light`
  top border, `--space-sm` padding on top and `--space-md` at the sides and
  bottom, the text at `--text-sm` in `--color-text-secondary`, italic, clamped to
  six lines with an ellipsis. It is a glance, not a reader; the whole entry is on
  the day screen.
- **Nothing at all** — no values, no activities, no Hive line and no notes — is
  one `PanelNote` (#351), no icon: "Nothing recorded for this day.", or on a
  future day "Nothing planned or due yet."

**The summary shows what has landed and nothing else.** A section whose read is
not ready is simply absent; the one status line under the grid is where a
failure is stated, once, for the whole screen. A summary that repeated "Couldn't
load from Hive." inside a card that is otherwise full would say the day is broken
when the day is right there — #356's rule about a second read, applied to a
screen.

---

## Reading and caching

### The reads

Five keys, all through `getDataSource()` and none of them per day:

| Read | Range | When | Calls |
|---|---|---|---|
| `readHealth` | `CALENDAR_HISTORY_FLOOR` → `today` | Always | 1 |
| `readWorkouts` | the whole grid | Always | 1 |
| `readEntries` | the whole grid | Always | 1 (a Sheets request) |
| `readHiveCompleted` | grid start → `min(grid end, today − 1)` | Only when the grid starts before today | 2, plus `getStatuses` per board when the range reaches before 2026-09-20 |
| `readHiveDue` | `max(grid start, today)` → grid end | Only when the grid ends on or after today | 1, plus `getBoards` once per page |

- **`readWorkoutPlans` is never called.** #356 says it is not for this screen: it
  costs one `getWorkoutSets` per planned strength workout in its range, and no
  mark or line here shows an exercise or set count.
- **The two Hive reads split at today**, because #353 is explicit that
  `readHiveDue` answers "what is open and due on these dates, as of now" and not
  "what was due then". A grid entirely in the past asks only the completed read;
  one entirely in the future asks only the due read; the month you are in asks
  both, over the two halves.
- **Today's own day is on the due side** — the summary asks what is outstanding,
  which is what the day screen's To do card asks on today (#353).

### `readHealth` over all history, for one call

```ts
useCalendarRead('readHealth', CALENDAR_HISTORY_FLOOR, today)
```

`CALENDAR_HISTORY_FLOOR` is `'2000-01-01'`, in `src/calendar/shading.ts`. It is
not a claim about when anything starts; it is a lower bound early enough that
nothing can fall below it, so the key never changes and the read is asked once.

**This costs exactly one Apps Script call, the same as a one-day read.**
`getDailySummaries` reads the whole `DailySummary` tab with `getAllRows` and
filters in memory (`apps-script/src/daily-summary.js`), so the bound is applied
after the work is done and a narrower range saves nothing — the same property
#357 relies on for its 31-day window. Nothing in Thrive answers "when does health
begin"; `getHistoryDateRange` is the `Workouts` tab's span, which is a different
question.

**What it does cost is bytes.** All of `DailySummary` is one row per day with
activities or health, so a year and a half of use is several hundred rows and a
few hundred kilobytes of JSON, against a few kilobytes for a month. It is read
**once per session** and serves both the shading's groups and every month's
health values, so the alternative — a month-sized read plus a separate
all-history read when a metric is chosen — is two calls and two payloads where
this is one of each. The call count is what the quota counts, and the payload
lands once.

**And the same answer is the summary's.** The selected day's sleep, resting HR,
HRV and steps are `data.get(date)` out of the map the shading already holds.
There is no second health read on this screen.

### The cache

`src/calendar/monthCache.ts`, and the hook every part of this screen reads
through:

```ts
export function useCalendarRead<T>(name: ReadName, from: IsoDate, to: IsoDate): DayRead<T>;
export function revalidateCalendar(): void;   // the screen mounting, and visibilitychange
export function clearCalendarCache(): void;   // the session signal changing
```

It returns #351's `DayRead` — `not-connected`, `loading`, `ready` with `data`
and `sentAt`, `error` with `offline` and `retry()`, or `session-expired` — so
every status on this screen has the same five shapes and the same words as every
panel. **It is a second, separate map; `useDayRead` is untouched**, and the two
never share a call with each other.

- **The key** is `name + '|' + from + '|' + to`, compared exactly — #351's key
  discipline, so nothing looser shares and a grid of 35 days and one of 42 are two
  keys.
- **A landed answer is served at once.** A key with data is `ready` on the first
  render, with no call and no `loading`. **That is the whole difference from
  `useDayRead`**, and the reason this screen has its own map: #351 declines to
  cache because the day screen's cases already ask together and every read there
  is meant to be fresh. This screen's case is different in kind — swiping months
  asks for the same keys again within seconds, and the answer for a month you
  looked at ten seconds ago cannot have changed in a way you are looking for.
  What #351 says a cache would need is an expiry rule; here it is two lines, and
  they are the next two bullets.
- **Every key the screen holds is re-read in the background when the screen
  mounts and when `visibilitychange` reports the page visible.** What is on
  screen stays until the new answer replaces it; a re-read that fails leaves it
  and says nothing; a key with no data goes through `loading` — #351's background
  refresh, exactly. **This is what keeps #352's warning true**: opening the
  Calendar re-reads the grid's entries, so a journal dot that a save changed
  appears without a reload.
- **Nothing else re-reads.** Moving to a month already cached renders it with no
  call, which is what "cached so month-to-month swiping stays quick" means.
- **At most one call in flight per key.** A hook that needs a key with a call
  already in flight joins it and takes the same answer.
- **A newly shown grid's reads are asked 300ms after the month settles.** A
  single move reads 300ms later, which is invisible beside a call that takes a
  second or more, and swiping through five months makes one set of calls, for the
  month you stop on, instead of five. It is the same 300ms `PanelStatus` waits
  before it says "Loading…", so a month you stop on is asked for before it could
  have said anything anyway. Cached months are rendered immediately and start no
  timer. `readHealth`'s key does not change with the month, so it is never
  delayed after the first time.
- **Stale answers are dropped, per hook.** An answer for a grid no longer shown
  is ignored, and the call is not cancelled — its request is already made, and a
  swipe back to that month takes it.
- **The whole map is dropped when #350's `session` signal changes** — the session
  ends, Reconnect brings a new token, another account signs in. #353 clears its
  board lookup on the same signal for the same reason: an answer read for one
  account must never be shown under another. In demo mode there is no session and
  this never applies.
- **`retry()`** re-reads that key, once, however many hooks hold it.

### What it costs

| What you do | Calls |
|---|---|
| Open the Calendar on this month, first time this session | 5–6: health, workouts, entries, Hive due, Hive completed (2) |
| Swipe to last month | 4–5: workouts, entries, Hive completed (2, plus `getStatuses` per board before 2026-09-20) |
| Swipe back to this month | 0 |
| Tap any day in a shown month | 0 |
| Come back to the tab, or leave the Calendar and return | One per key the screen holds |

At a second or more per Apps Script call (implementation-plan.md § Risks) and 60
Sheets reads a minute (#351), the expensive case is browsing back through months
older than 2026-09-20, where #353's completion rebuild adds a `getStatuses` call
per board. [hive#266](https://github.com/luketmoss/hive/issues/266) turns those
into one call and
[hive#265](https://github.com/luketmoss/hive/issues/265) removes the unfiltered
`getItems` from the same read; both are filed, neither is waited for, and the
300ms settle plus the cache are what make the wait a one-off per month rather
than a cost per swipe.

### What a failure looks like

One status line, `CalendarStatus` in `src/calendar/`, directly under the grid and
above the legend, built as a `PanelNote` (#351) with the same icons and the same
words as `PanelStatus` — with the sources it names joined, because on this screen
several reads fail together and four copies of one sentence is not four pieces of
information.

| Situation | Line |
|---|---|
| Nothing has landed yet and something is in flight | After 300ms, "Loading…" in `--color-text-muted`, `role="status"` |
| One or more reads are `session-expired` | Alert icon in `--color-warning`: "Reconnect to load this." |
| One or more are `error`, and `navigator.onLine` was false | Alert icon in `--color-danger`: "You're offline — couldn't load from Thrive and Hive." · **Try again** |
| One or more are `error` | "Couldn't load from Thrive." / "Couldn't load from Hive." / "Couldn't load from Thrive and Hive." / "Couldn't load from your almanac sheet." · **Try again** |
| One or more are `not-connected` | Info icon: "Thrive isn't connected yet." / "Hive isn't connected yet." / "Thrive and Hive aren't connected yet." |

- Sources are named once each, in the order Thrive, Hive, your almanac sheet, and
  joined with "and". The plural of the not-connected sentence changes with the
  count, which is why it is this screen's own component rather than #351's
  `PanelStatus` with a run-together `source` string.
- Only one line shows, by the order of that table — session-expired first, then
  error, then not-connected, then loading. They do not stack.
- **Try again** calls `retry()` on every key that is in `error`: one call each,
  and a second tap while they are in flight joins them.
- It is not `role="alert"`, for #351's reason: offline, every read on the screen
  fails at once.
- **An empty answer is `ready`.** A month with no workouts, no entries and no
  Hive activity is a quiet month, and the grid and the summary say so in their
  own words. Nothing on this screen turns an empty result into an error, and
  nothing turns a refusal into an empty month (#350).

### The legend

Under the scale, `--space-sm` above, at `--text-xs` in `--color-text-secondary`,
wrapping, `--space-xs` and `--space-md` apart:

- the six type icons with their legend words, in the table's order: Strength,
  Ride, Hike, Run, Walk, Stretch — shown when the workouts read is `ready`;
- a `--cal-note-size` dot in `--color-primary` and "Journal entry" — shown when
  the entries read is `ready`;
- one dimmed `dumbbell` and "Planned".

A legend for marks that cannot appear is noise, which is why each half waits for
its own read. Icons here are `--icon-xs`, as in the cells.

---

## Demo mode

Everything works against #350's generated data, with no request leaving the page,
and every state on this screen is reachable by moving between months:

| State | Where |
|---|---|
| A full month of marks, dots and shading | This month and the last two |
| Planned workouts, dimmed | Today through six days ahead |
| A day with three or more workouts, "+n" | Wherever the generator places two activities and a plan |
| Hatched days | The ~5% of nights the watch was not worn, scattered through the last 371 days |
| Days before health begins, unshaded and unhatched | Any month more than about 372 days back |
| "Not enough … to shade — needs 14 days." | Not reachable: the generator gives 371 days of health. It is the state a new account is in, and the suite covers it |
| A month with no workouts at all | More than about 567 days back |
| Journal dots | The ~72% of the 80 days before today with entries, plus the note four days ahead |
| "2 Hive items completed" | The last 240 days |
| "3 Hive items due" | Four days ago through 13 days ahead |
| "Nothing recorded for this day." | Any day more than 567 days back |
| "Nothing planned or due yet." | Any day more than 14 days ahead |

The **Shade by** choice is held in memory only, per #350's rule that demo mode
touches no storage, so a reload starts at Nothing.

---

## Edge cases

- **Midnight in Denver with the Calendar open.** The `today` signal rolls over:
  today's ring moves a cell, the health read's key gains a day and is re-read
  once, the Hive split moves by a day and its two keys change, yesterday's
  summary becomes a past day and swaps its due line for a completed one, and the
  Today control's condition is re-evaluated. The month heading does not move
  unless the month did.
- **A month with 28 days starting on a Monday** — February 2027 — is a four-week
  grid with no leading or trailing days. Six-week grids happen whenever the lead
  plus the month's length passes 35. The grid's rows are whatever `gridRange`
  gives; nothing assumes five.
- **Across a year end.** The grid for January 2027 leads with days from December
  2026 and reads them like any other; the accessible names carry no year, and the
  month heading does.
- **A journal entry saved a moment before opening the Calendar.** #352 commits
  the text when its block unmounts, but the write may still be in flight when
  this screen's `readEntries` goes out, so the dot can be a beat late. It appears
  the next time the screen opens or the tab comes back. almanac reads the sheet,
  and nothing here reaches into the day screen's unsaved changes.
- **An entry with only a check-in and no notes** gets no dot. The dot is
  `notes !== null` (#352), and the check-in shows in the summary as Energy and,
  when the watch has nothing, as the sleep stand-in.
- **A day with a workout and nothing else.** One icon, no dot, no shading if the
  watch has nothing — and the summary lists the activity and says nothing else.
- **A workout Thrive returns with an unknown type** never arrives: #356 drops
  those rows at the mapping, with a dev-only warning. The grid is built on the
  same six types the badge is.
- **Every value in the metric's history is the same.** `q1`, `q2` and `q3` are
  equal and `bandOf` puts every day in band 1 — the lowest, since the test is
  `<=`. The scale's two ends read the same number, which is true.
- **Fewer than 14 values for one metric and plenty for another.** The state is per
  metric: Steps can shade while HRV says "Not enough HRV yet to shade".
- **Offline.** The header, the month moves, the grid's dates, the selection, the
  keys and the swipe all work; every read fails together and the one status line
  says so once, with **Try again**. Nothing is hatched and nothing is shaded.
- **The session has ended.** The screen stays usable, the status line says
  "Reconnect to load this.", and after Reconnect the cache is dropped and every
  key the screen holds is read again by itself.
- **Live mode, now.** With `VITE_THRIVE_API_URL` and `VITE_HIVE_API_URL` empty,
  `readWorkouts`, `readHealth`, `readHiveDue` and `readHiveCompleted` are never
  attached, so the grid shows dates and journal dots, the shading is unavailable,
  the summary shows Energy and the journal, and the line reads "Thrive and Hive
  aren't connected yet." **Until thrive#144 and hive#264 ship**, the calls are
  refused and it reads "Couldn't load from Thrive and Hive." — the source is
  connected and is saying no, which is the correct thing to show (#353, #356,
  #357).
- **Until the COROS sync (thrive#127) runs**, `readHealth` answers with rows that
  carry no health, which #357's mapping gives no key at all, so `firstValueDate`
  is `null`, no day is hatched and no day is shaded — not a month of hatching.
  The scale is replaced by "Not enough sleep yet to shade — needs 14 days." That
  is the honest state, and it is what the issue means by "health shading hatches
  until the COROS sync delivers data", corrected: it does not hatch, because
  hatching a day almanac was never told about would be a claim.
- **Swiping fast across months.** The 300ms settle means one set of calls for the
  month you stop on. Answers for months you have left are dropped; calls already
  sent carry on and their answers land in the cache, so swiping back to one of
  them is free.
- **Crossing 960px.** The layout is CSS only and nothing remounts, so no read is
  repeated and the selection, the scroll position of the Shade by row and the
  keyboard focus are all kept.
- **A very long journal entry** is clamped to six lines in the summary. **A very
  long workout name** wraps on any character, so the summary row grows taller
  rather than the card growing wider.
- **`prefers-reduced-motion: reduce`.** There is no animation on this screen to
  reduce: a month change swaps the grid with no slide. #351's day-screen slide is
  a day screen thing, and a whole grid sliding sideways every swipe is motion for
  its own sake.

---

## Copy

| Where | String |
|---|---|
| Heading | September 2026 |
| Title, today's month | Calendar · almanac |
| Title, another month | September 2026 · almanac |
| Header buttons | Previous month · Next month |
| Top bar | Today *(#351)* |
| Shade by label | Shade by |
| Shade by group label | Shade days by |
| Shade by choices | Nothing · Sleep · Resting HR · HRV · Steps |
| Grid label | September 2026 |
| Weekday headers | M T W T F S S, named Monday … Sunday |
| Cell, heard | Saturday, September 12, Mountain Bike, planned Stretch, journal entry, resting HR 52 bpm |
| Cell, heard, no value | Tuesday, September 15, no resting HR |
| More marks | +2 |
| Scale ends | 6h 12m · 9h 04m · 49 bpm · 38 ms · 9,412 |
| Scale, no data | no data |
| Caption | Shading splits every day from Sep 15, 2025 into four equal groups. More colour means a higher sleep, not better or worse. |
| Too few values | Not enough sleep yet to shade — needs 14 days. |
| Metric words in the caption and that line | sleep · resting HR · HRV · steps |
| Legend | Strength · Ride · Hike · Run · Walk · Stretch · Journal entry · Planned |
| Summary header | Saturday, Sep 12 |
| Summary action | Open day |
| Summary terms | Sleep · Sleep (you said) · Resting HR · HRV · Steps · Energy |
| Summary values | 7h 12m · 7½ h · 52 bpm · 38 ms · 9,412 · High |
| Activity, planned | Planned: Upper Push A |
| Activity, a past day's plan | Planned, not done: Upper Push A |
| Hive, a past day | 2 Hive items completed · 1 Hive item completed |
| Hive, today or later | 3 Hive items due · 1 Hive item due |
| Summary empty, past or today | Nothing recorded for this day. |
| Summary empty, future | Nothing planned or due yet. |
| Loading | Loading… |
| Not connected | Thrive isn't connected yet. · Hive isn't connected yet. · Thrive and Hive aren't connected yet. |
| Error | Couldn't load from Thrive. · Couldn't load from Hive. · Couldn't load from Thrive and Hive. · Couldn't load from your almanac sheet. |
| Error, offline | You're offline — couldn't load from Thrive and Hive. |
| Error action | Try again |
| Session ended | Reconnect to load this. |

"Loading…", "Try again", "Reconnect to load this." and the not-connected and
error sentences are #351's `PanelStatus` wording with this screen's sources in
them, not new strings. Sentence case throughout, and nothing on this screen is a
verdict: it shows a month and never rates it (spec §1, §9.10).

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
| 52px minimum cell height, `1 / 1.1` aspect | the prototype's `.cal-cell` |
| 4px grid gap and cell padding → `--space-xs`; 12px radius → `--radius-md` | the prototype's `.cal-grid`, `.cal-cell` |
| 14px cell icons → `--icon-xs` (13px) | the prototype's `.cal-icons .ico`; #357's token, within a pixel |
| 6px journal dot | the prototype's `.cal-note` |
| 22 × 14 legend swatches, 3px radius → `--radius-xs` | the prototype's `.scale .sw` |
| `1.5fr / 1fr` columns, 20px gap → `--space-lg` | the prototype's `.cal-layout` |
| 16%, 36%, 62%, 90% | design-language.md § Data colours |
| 70% for dark's third step | measured here, below |
| The quartile indices `sorted[floor(p × (n − 1))]` at .25/.5/.75, and `<=` bands | the prototype's `quartiles()` and `binOf()` |
| 14 values before anything is shaded | `RANGE_MIN_VALUES` in `src/data/range.ts` (#357), from spec §9.8 |
| `'2000-01-01'` as the history floor | chosen here: a bound nothing can fall below, so the key never changes. The call costs the same whatever it is |
| 60px, 1.6× and 900ms for a swipe; 350ms swallowing its click | #351, from the prototype's swipe handler |
| 300ms before "Loading…", and the 300ms settle before a new month is read | #351's `PanelStatus`; the settle is the same number for the reason given above |
| Six lines of journal in the summary | chosen here: enough to recognise an entry, short enough that the summary stays a column beside the grid |
| One call for `getDailySummary` over any range | `getDailySummaries` reads the whole tab with `getAllRows` and filters in memory (`apps-script/src/daily-summary.js`), as #357 cites it |
| One call for `readWorkouts` over any range | #356 |
| One Sheets request for `readEntries` over any range | #350 |
| 2 calls for `readHiveCompleted`, plus `getStatuses` per board before 2026-09-20 | #353 |
| 60 read requests a minute per user | the Google Sheets read quota, as #351, #352, #353, #356 and #357 cite it |
| A second or more per Apps Script call | implementation-plan.md § Risks |

**Will two icons and a "+n" fit in a cell at 360px?** No, by arithmetic, not
measured. #351's 328px column less six `--space-xs` gaps is 304px over seven
columns, about 43.4px a cell; less `--space-xs` padding each side leaves about
35.4px. Two `--icon-xs` icons are 26px and "+1" at `--text-xs` weight 700 is
about 13px, which is 39px with no gap at all. That is why the marks row holds two
things, not three, and the issue's criterion says so. At 960px and above a cell
is about 90px wide and all three would fit; the rule does not change with the
width, because a mark that means something different at two sizes is worse than
one that means one thing.

**Is a cell a big enough target?** About 43.4 × 47.7px at 360px, with
`--cal-cell-min-h` holding it to 52px — both sides over the design language's
40px minimum for a touch target.

**Contrast of the shading ramp.** Computed from the design language's hex values
with the WCAG relative-luminance formula, on `color-mix(in srgb, …)` — the space
#350's `--color-band` already uses. `/test` checks the shipped values in the
running app with `getComputedStyle()`.

| Band | Light fill | `--color-text` | `--color-on-primary` | `--color-primary` |
|---|---|---|---|---|
| 1 (16%) | `#EBE0F6` | 12.2 ✓ | — | 4.93 ✓ |
| 2 (36%) | `#D0BAEA` | 9.36 ✓ | — | 3.56 ✓ |
| 3 (62%) | `#AD88DA` | **5.74 ✓** | 2.87 ✗ | 2.18 ✗ |
| 4 (90%) | `#8852CA` | 3.23 ✗ | **5.11 ✓** | 1.23 ✗ |

| Band | Dark fill | `--color-text` | `--color-on-primary` | `--color-primary` |
|---|---|---|---|---|
| 1 (16%) | `#362F42` | 10.6 ✓ | — | 5.84 ✓ |
| 2 (36%) | `#59486F` | 6.75 ✓ | — | 3.72 ✓ |
| 3 (62%) | `#866AAA` | 3.74 ✗ | 4.05 ✗ | 1.75 ✗ |
| **3 (70%)** | `#9474BC` | 3.18 ✗ | **4.76 ✓** | 1.40 ✗ |
| 4 (90%) | `#B78EE9` | 2.16 ✗ | **7.00 ✓** | 1.19 ✗ |

Text needs 4.5:1 and the icons and the journal dot, as non-text marks, need 3:1;
both thresholds are met by the column marked in bold on each row, which is what
`--cal-ink-3` and `--cal-ink-4` select. The 62% dark row is the one that forced
the departure: nothing legible sits on it.

`/test` checks the cell size, the marks row, the tap targets, the two-column
layout and the ramp's computed colours in the running app, in demo mode, with
`getBoundingClientRect()` and `getComputedStyle()` at a 360px-wide viewport and
at 960px — the widths #351, #352, #353, #356 and #357 already check at.

---

## New tokens

The design language, #350, #351, #352, #353, #356 and #357 have no token for
these. Each value comes from the source named, and `global.css` defines it on
`:root` like the rest.

| Token | Light | Dark | For | Source |
|---|---|---|---|---|
| `--cal-shade-1` | `color-mix(in srgb, var(--color-primary) 16%, var(--color-surface))` | the same | the lowest quarter | design-language § Data colours |
| `--cal-shade-2` | the same at 36% | the same | the second quarter | design-language § Data colours |
| `--cal-shade-3` | the same at 62% | **the same at 70%** | the third quarter | design-language § Data colours, with the dark departure measured above |
| `--cal-shade-4` | the same at 90% | the same | the highest quarter | design-language § Data colours |
| `--cal-hatch` | `repeating-linear-gradient(135deg, transparent 0 5px, var(--color-border-light) 5px 6px)` | the same | a day the watch has nothing for | prototype `.heat-none` |
| `--cal-ink-3` | `var(--color-text)` | `var(--color-on-primary)` | everything drawn on a band-3 cell | measured above |
| `--cal-ink-4` | `var(--color-on-primary)` | `var(--color-on-primary)` | everything drawn on a band-4 cell | measured above |
| `--cal-cell-min-h` | `52px` | | a day cell's minimum height | prototype `.cal-cell` |
| `--cal-note-size` | `6px` | | the journal dot in a cell and in the legend | prototype `.cal-note` |
| `--cal-swatch-w` | `22px` | | a scale swatch | prototype `.scale .sw` |
| `--cal-swatch-h` | `14px` | | a scale swatch | prototype `.scale .sw` |

**No new colours beyond the ramp.** `--color-primary`, `--color-on-primary`,
`--color-text`, `--color-text-secondary`, `--color-text-muted`,
`--color-border-light`, `--color-surface` and `--today-ring` are all the design
language's or #351's, used for what they name.

**Seven new icons**, all from the prototype's set: the six workout types —
`dumbbell`, `bike`, `mountain`, `run`, `walk`, `stretch` — and `clock`, for the
summary's "items due" line. They join the `plus`, `ext`, `check` and `info` #353
brought in, the `heart` #356 brought in, the `wave`, `steps`, `up` and `down`
#357 brought in, and the `moon`, `alert`, `sunrise`, `sunset`, chevrons and `x`
#350, #351 and #352 already use.

Sizes the prototype uses off the scale are brought onto it instead of getting
tokens, as every note before this one did: the grid's 11px weekday letters and
the "+n"'s 10px become `--text-xs`, the cell's 5px padding and the grid's 4px gap
become `--space-xs`, the layout's 20px gap becomes `--space-lg`, the cell icons'
14px becomes `--icon-xs`, the swatch's 3px radius becomes `--radius-xs`, the
chips' 36px minimum height becomes the design language's 40px, and the summary's
`.kv` 8px/12px gaps become `--space-sm` and `--space-md`.

---

## What #359 can reuse

- **`src/calendar/shading.ts`'s metric table** — the four metrics, where each one
  comes off `Health`, and how each is formatted. #359's Recovery, Sleep and
  Activity groups draw the same four, and a second table would be a second place
  for "resting HR" to be spelled.
- **The all-history `readHealth` call.** One call covers any range, so #359's
  "All" range is the same question this screen already asks, and
  `CALENDAR_HISTORY_FLOOR` is the floor it can ask from. Whether the two screens
  share one cache is #359's call; nothing here assumes they do.
- **`monthCache.ts` whole**, if #359 wants it: it is a key-exact, session-scoped
  cache over `getDataSource()` with #351's statuses and background refresh, and
  nothing in it is calendar-specific but its name.
- **`calendarHref` and `gridRange`**, for a link from a chart into a month.
- **Not the shading ramp.** § Charts gives charts `--color-primary` lines,
  `--chart-dot` dots and `--color-band` bands; the four-step ramp is the
  calendar's and means "which quarter", which no chart asks.
