# 504 — Day: tapping a metric opens its trend

A row on the Day screen's Health or Body panel opens a single-metric trend
view: that metric's name and value for the day, one large chart, its average,
low and high for the range, and chips to hop to the others in its group.

Prototype: the "Day tile → metric trend" artboard (`DayToTrend.dc.html`) on the
canvas "Thrive Trends — modern controls prototype". **Depends on #503**: the
range and average controls here are #503's chips and menus, reused, so #503
merges first.

Standing documents this answers to: `ui/docs/design/keel-wide-rules.md` and
`ui/docs/design/suite-language.md`. Notes this builds on:
`503-trends-icon-toolbar.md` (the chips and menus), `404-interaction-states.md`
(the states a row-as-link needs).

## Measured first

From the running app in demo mode, Day at 375 × 812, `getBoundingClientRect()`
of each `.health-row` (309 wide):

| Row | Height |
|---|---|
| Sleep | 114 |
| Resting HR, HRV, Steps, Weight, Blood pressure | 42 |
| Average stress, Body fat | **24** |

Two rows are 24px and five are 42px; the suite floor for a row is 44px, so a
tappable row cannot keep today's padding. Each tappable row grows to **at least
44px**; the taller rows (Sleep) are unchanged.

## What the prototype drew that this does not

The prototype redraws the Day metrics as **tiles** in a two-column grid, each
with a sparkline and a range caption. Thrive's Day screen today shows
**rows** in a list, and a tile layout is a redesign of two panels, not part of
"make a metric open its trend". This issue keeps the rows and makes each one
tappable. The tiles are a separate decision if wanted.

The prototype's grid-of-squares button ("Open the Recovery group in Trends") in
the header and its single-tap "cycle the average" button are also not carried:
the sibling chips already reach the group, and #503's menu replaces cycling.

## Which rows open what

| Day row | Opens | "Also in" chips |
|---|---|---|
| Sleep | Total Sleep | Deep Sleep, REM Sleep, Sleep Score |
| Resting HR | Resting HR | HRV, Average Stress |
| HRV | HRV | Resting HR, Average Stress |
| Average stress | Average Stress | Resting HR, HRV |
| Steps | Steps | *(none: Steps is in no group but Custom)* |
| Weight | Weight | Body Fat |
| Body fat | Body Fat | Weight |
| Blood pressure | Systolic | Diastolic, BP Readings |

"Also in <Group>" is the first of Trends' groups, other than Custom, that holds
the metric, and the chips are that group's other metrics in its order. A metric
in no such group (Steps) shows no chip row. Blood pressure shows two numbers
and one row; it opens **Systolic**, with Diastolic one tap away.

A row is tappable whether or not it has a value today ("Arrives with the next
sync", "No reading this day"): the history is still there. A panel that is
only a note ("No watch data for this day", "Not synced yet today") has no rows,
so nothing to tap.

## The main path

1. On Day, a row shows a small `↗` at its right edge and is one tap target.
   Its accessible name is the row's own text followed by "Open trend", for
   example `Resting HR 52 bpm. Open trend`. The `↗` is `aria-hidden`.
2. Tap it: the app goes to `#/trends/<metric-id>?date=<that day>`. The Trends
   tab in the bottom nav shows as current.
3. The screen, top to bottom:
   - **Back** (`‹ Day`), and on the right #503's range chip and average chip
   - the **metric name** (the `h1`)
   - the **day's value, large**, with its unit, and under it `Your range
     48–56 bpm (Aug 28 – Sep 26)`
   - **one large chart**: dots, the average line and the range band, as Trends
     draws them, at least **240px** tall (a Trends card's is 180)
   - **Average · Low · High** for the selected range, three small cards
   - **Also in Recovery**: the chips
4. Back returns to the Day screen for the date that was open.

### The value and the day

`?date=` carries the day the row was on, and the headline shows that day's
value, so the number tapped is the number seen. When the date is today it
reads `52 bpm today`; otherwise `52 bpm on Fri, Oct 16`. The chart always ends
today, as Trends does (one clock, #286), whatever the date. If that day has no
value the headline is `—` with `No reading this day.`

Steps today is a day in progress and is not plotted (`excludesToday`); the
headline then reads `9,412 steps so far`, as the Day row does.

### The range, average and prefs

The chips are #503's, **and share its remembered range and average**: change
them here and Trends shows the same, and the other way round. Two screens that
disagree about "the range" would be a bug, not a feature. The view switch and
the tabs are not here: there is no table for one metric, and no groups.

### Low, high, average

Computed over the plotted daily values in the selected range, formatted by the
metric (`7h 12m`, `183.4`, `9,412`), with its unit. The average is the series'
own mean, the same number as Trends' "Average" in its summary line. Blank when
the range has no values: `—`, never `0`.

### The also-in chips

Each is a button, at least 44px tall, labelled with the metric's name. Choosing one **replaces** the history entry, so Back still goes straight
to Day and not through every metric visited. `?date=` is kept, so the headline
day does not change. The current metric is not offered.

### The chart

Tapping or arrowing across the chart selects a day and shows the same readout
with `Open day ›` that Trends gives, with the same keyboard behaviour. The
selection is not stored and is cleared when leaving the view.

## States

| State | What shows |
|---|---|
| Loading | `Loading…` (a `role="status"`), the header, back and chips already present |
| Error | `Couldn't load your health data.` and `Try again`, as Trends |
| Never recorded | headline `—`, `Nothing recorded yet.` in place of the chart and stats, no stats cards, chips still shown |
| None in range | headline as usual, `No resting HR in this range.` in place of the chart, stats `—` |
| Unknown metric id in the URL | the URL is replaced with `#/trends` and Trends shows, as a bad `#/day/…` date is |
| Bad or missing `?date=` | treated as today |
| Opened by link, nothing before it in history | Back goes to Day for `?date=` (or today) rather than leaving the app, as the other Back arrows do (#264) |

Health data is loaded on entry if nothing has loaded it, as Trends does, so a
refresh on this URL works.

## Interaction states (per #404)

The tappable row is a **Rows and cards** control: rest as today; hover overlay
under `@media (hover: hover)`; pressed overlay; the global focus ring (inset
offset where the panel clips an outside ring); no selected state; no disabled
state. Its class is added to the Rows and cards table in
`404-interaction-states.md` in the same change, which
`interaction-states.test.ts` enforces. The sibling chips are **Chips and
toggles**, without selected (they navigate). The stats cards are not
interactive.

## Document title

`Resting HR trend — Thrive`, from the metric's label.

## Copy

`Open trend` (accessible name suffix) · `‹ Day` · `Also in Recovery` ·
`Average` `Low` `High` · `Nothing recorded yet.` · `No <metric> in this range.`
· `No reading this day.` · `<value> today` · `<value> on Fri, Oct 16` ·
`<value> so far`.

## New tokens

None. The chart keeps Trends' own colours; the prototype's per-metric colours
(a dot, a coloured line) are mock-up and are not carried.
