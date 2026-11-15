# 913 — Forage Trends: the screen, and the Energy tab

Specifies [#913](https://github.com/luketmoss/keel/issues/913), part of epic
[#889](https://github.com/luketmoss/keel/issues/889). The layout and copy reference is the epic's prototype,
[`889-trends-prototype.html`](889-trends-prototype.html) (the "Forage: Trends" scene); its numbers are example data.
Tokens, spacing, touch targets and "blank is not zero" come from
[`suite-language.md`](../../../ui/docs/design/suite-language.md) (standing); the shell, header and account button from
[`704-app-shell.md`](704-app-shell.md); the day card's Low rule and the totals' shape from
[`712-food-log.md`](712-food-log.md); the `#/eaten/<date>` route from [`825-eaten-by-date.md`](825-eaten-by-date.md).
None is restated. The only standing documents are `ui/docs/design/`'s three; `forage/docs/design/` has none.

**This note is also the chart's rules for the rest of the epic.** [#914](https://github.com/luketmoss/keel/issues/914),
[#915](https://github.com/luketmoss/keel/issues/915) and [#916](https://github.com/luketmoss/keel/issues/916) cite §The
chart, §The readout, §Range and average and §The route by name and add only what is new to their tab.

Forage's chart follows **Thrive's look and rules** (decided 2026-11-14) and is its own code. Thrive's
`components/trends/` was read as reference only; nothing is imported from it or moved.

## Main path

1. On Eaten, tap the **Trends** button in the header. The screen opens on **Energy**, at the range and average last
   used (first time: 1M, 7-day average).
2. The top card reads `1,980 kcal a day, on average`, and under it `24 of 29 days logged · 3 low`.
3. The bar chart shows each day. Tap a day: the readout above the chart reads that day, and offers **Open day ›**.
4. Tap a dashed gap: the readout says `Nothing logged` and offers **Log this day ›**. Tapping it opens Eaten on that date.
5. Tap the back arrow, or Back on the phone: Eaten, on the day Trends was opened from.

## The route

| Hash | Opens |
|---|---|
| `#/eaten/trends` | Trends, on Energy, at the stored range and average |
| `#/eaten/trends?range=3M` | the same, at 3M for this visit |
| `#/eaten/trends?metric=kcal&range=3M` | the chart for a metric (below), at 3M; Thrive's Food cards link here (#890) |
| `#/eaten/trends?tab=meals` | a tab by name |

- **Matched before #825's rule.** #825 sends anything under `#/eaten/` to a date, and rewrites a hash it cannot read to
  `#/eaten`. A hash is Trends when its path is exactly `#/eaten/trends`, ignoring anything from `?` on, and that test runs
  first. `#/eaten/trends/x` is not Trends: it is under #825's rule and opens today.
- **Parameters.** `range` is one of `1W 1M 3M 6M 1Y All` (case as written). `tab` is one of `energy macros nutrients meals foods`.
  `metric` names a chart and implies its tab: `kcal` is Energy; #914 adds `protein`, `carbs`, `fat` (Macros) and the seven
  nutrients (`satfat`, `transfat`, `cholesterol`, `sodium`, `fiber`, `sugars`, `added_sugars`, Nutrients). Anything unknown, or a
  tab or metric whose tab is not built yet, is dropped and the screen opens on Energy. Nothing says the link was wrong.
  When `metric` and `tab` disagree, `metric` wins.
- **A link does not change what is remembered.** `range` in the hash applies to that visit and is not written to the stored
  choice; changing the control afterwards is a choice and is stored.
- **The hash follows the screen.** After a range or tab change the hash is rewritten in place (`history.replaceState`, as #825
  does for the day): `#/eaten/trends?tab=energy&range=3M`. A reload reopens the same view, and Back from a day opened off a
  bar returns to the same tab and range. The selected day is not in the hash.
- **Opening and leaving.** The Trends button is a link and adds a history entry, so Back from Trends is the previous entry
  (Eaten on the day it was on). **Open day ›** and **Log this day ›** add one too. Range and tab changes add none.
- **The back arrow** goes to `#/eaten` or `#/eaten/<date>`, by #825's rule, for the day Eaten last showed in this page load
  (`eatenDate`), never to the bar's date. Opened cold (a link, a reload), that is today. Trends does not change `eatenDate`
  until a day is opened from it.
- **The tab bar** stays, Eaten current. Tapping **Eaten** while on Trends goes to the Eaten day view (the other tabs' rule:
  a tab press leaves a sub-screen); the other tabs go where they go.
- Signed out: the sign-in screen, then Trends on the hash's route. Demo mode: `?demo=true#/eaten/trends` opens Trends over
  demo data (a few days of totals, so the chart has bars, one low day and gaps).

## The Trends button on Eaten

Eaten is otherwise unchanged. The header gains one 44px icon button, `aria-label="Trends"`, a rising-line icon, drawn
outlined like the account button's neighbours, between the next-day arrow's cluster and the account button. It is the only
change to Eaten. It carries `title="Trends"`.

**Measured** (demo mode, 375px viewport, `getBoundingClientRect`): the header has a 16px gutter each side and an 8px gap;
today the day cluster (previous 44, day title, next 44, 4px gaps) is 291px wide and its title column is 195px. Adding a 44px
button and one 8px gap leaves **143px** for the title column. The day title (`Wednesday` is the widest, 108px) fits; the
date line does not: `Saturday 14 November 2026` is 176px and the longest, `Wednesday 30 September 2026`, is 196px.
At 375px the date line therefore wraps to two lines on nearly every day (it already wrapped on the longest, at 195px).

Decided: **the date line may wrap, and the header reserves two lines for it at every width**, so the header is the same
height on every day and does not jump as the day arrows are used. It grows from 48px to the height of a one-line title and
a two-line date. Chosen over truncating the year (hides information), dropping the weekday from the date line (changes
Eaten's copy) and putting Trends in the account menu (hides the entry point the owner asked for).

## Screen layout

Header: back arrow (44px, `aria-label="Back to Eaten"`), `Trends` as the heading, then #704's account button. Below it,
in order: the range and average controls, the tabs, then the tab's cards. Only built tabs show: after this issue the tab
row is one tab, **Energy**, and a one-tab row is not drawn (the heading and cards stand alone). The tab row appears when
#914 adds the second.

### Range and average

- **Range**, a segmented control, as Thrive's: `1W 1M 3M 6M 1Y All`, one selected. Fixed ranges are the last 7, 30, 91,
  182 and 365 days ending **today, inclusive**. **All** runs from the first day anything is logged to today; with nothing logged
  at all the empty state below shows instead.
- **Average**, a second segmented control: `Off 7d 14d 30d`, one selected. It sets the average line's window.
- Both are remembered between visits on this device (`localStorage`, keys `forage-trends-range` and `forage-trends-average`).
  A missing, unknown or unreadable value gives the default (1M, 7d); a write that fails is ignored and the choice holds for
  the visit. Every storage touch is wrapped, as Thrive's `prefs.ts` does, so private mode never breaks the screen.
  Chosen: 1M, not Thrive's 3M, because a food log is younger than a health history and most of a 3M chart would be gaps.
- Both controls are `role="radiogroup"`-style groups with the selected option `aria-checked="true"`, 44px targets, and one
  tab stop for each with arrow keys inside, as the app's other segmented controls.
- A change of range or average is a swap, never an animation.

### Today is drawn, and is not counted

Today is in the range and is drawn, but it is a day still being eaten. Its readout says **so far**, and it is **left out of
the average, the weekday averages, and the "days logged" count**, which run through yesterday. The summary says so in words
when today is in the range: `Not counting today, which is still being logged`. Decided so a half-eaten day does not drag the
average down on every visit; it could go the other way (count it, mark it).

## Energy

Cards, in order: **summary**, **Calories** chart, **By weekday**.

### Summary card

- Large: the average in `--text-2xl` with tabular figures, to the whole number, then `kcal a day, on average`.
  `—` with `No days logged in this range.` when no counted day has calories.
- Under it, `--text-sm` `--color-text-secondary`: `24 of 29 days logged · 3 low`. The first number is counted days with
  calories; the second is counted days in the range, through yesterday; `3 low` appears only when there are low days and
  counts days whose `partial` is true. When today is in the range, the line after it reads
  `Not counting today, which is still being logged`.
- The average is the mean of the counted days that have calories, **low days included** (as the Day card does: they are
  shown low, not dropped). The `low` count is what tells the reader the average may be low too. The summary never compares
  (no arrows, no "up from", no good or bad colour), as Thrive's charts do not.

### The chart

**Bars, one per day**, the Day card's rules carried over (#714's food card):

| A day with | Drawn as |
|---|---|
| Calories, not partial | a solid bar in `--chart-bar` |
| Calories, partial (`partial: true`) | the bar **hatched** (diagonal stripes in `--chart-bar` on `--color-surface`), not colour alone, and the readout adds the `Low` chip |
| Entries but no calories (`kcal` null: every entry blank) | a **gap**, drawn as below. The readout says why |
| Nothing logged (absent from `days`) | a **gap**: a short dashed mark on the baseline in `--chart-gap`. **Never a zero-height bar** |
| Today | as above by its data; counted nowhere |

- **A gap is never 0.** A gap day is not in any average and the average line breaks across a stretch with no logged day
  (below).
- **The average line** is a rolling average over the counted days with calories in the last 7, 14 or 30 days ending that
  day, drawn as a line (`--chart-line`, 2px). It is drawn for a day only when the window holds at least one such day, and the
  line **breaks** where it is not drawn, so a long gap leaves a broken line, never a joined one (Thrive's rule). `Off` draws
  no line and drops it from the legend. The window uses days before the range too, so the first day's line is whole.
- **Y axis:** one axis, zero-based, ticks at round numbers (a "nice" maximum from the largest bar or average), labels in
  `--text-xs` `--color-text-secondary`, grid lines in `--chart-grid`. Whole numbers. The plot's left padding is fixed, so
  charts on every tab share their x positions.
- **X axis:** date ticks as Thrive's `dateTicks` spaces them (a few labels, `Nov 3`, with the year on a January tick). The chart
  takes its card's width and redraws on resize.
- **Colour:** bars `--chart-bar`, which is the app's `--color-primary` (Forage green). No semantic colour: a high day is not red.
- **Legend** under the chart, words with marks: `Day`, `7-day average` (its window), `Not logged`, `Low` (hatched).
  Each mark has its word beside it; a legend entry for something not on screen is left out.
- **No target lines**, no band (decided 2026-11-14, as in #714).
- **Reduced motion:** nothing animates, with or without the preference; selecting a day and changing a control are swaps.

**Long spans draw weeks.** A day is narrower than a bar can usefully be past about six months (a 365-day range in a phone
chart is under 1px a day). Decided: **a span of 182 days or fewer draws daily bars; a longer one (1Y, or All once the log is
older than that) draws weekly bars.** A week (Monday to Sunday, counted days only) is one bar: the mean kcal a day over its
logged days, hatched when any of its logged days is low, a gap when it has none. The readout for a week reads
`Week of Nov 2 · 2,310 kcal a day · 5 of 7 days logged`, with no day link (`Open day ›` is for a day; the readout says
`Use 6M or shorter to open a day`). The Average control is disabled in this mode, with `Weekly bars have no average line`
under the controls: each bar already is a 7-day mean. The summary and By weekday are unchanged (they come from the days).
Chosen over cramming 365 hairlines and over a separate daily/weekly toggle; it could go the other way.

### The readout

One line above the chart, in the same grid cell as the card's summary (so a selection never moves the card), `--text-sm`.

| Selected | Reads |
|---|---|
| Nothing selected | `Tap a day to read it.` |
| A day with calories | `Fri, Nov 6 · 2,140 kcal`, then `7-day average 2,010` when the average is on and defined, `Low` chip when partial, **Open day ›** |
| A partial day | as above, with `Low` chip and `some items have no nutrition` |
| Today | `Today · 1,120 kcal so far`, then **Open day ›**; no average text |
| Entries but no calories | `Fri, Nov 6 · logged, but nothing has nutrition yet`, **Open day ›** |
| Nothing logged | `Fri, Nov 6 · nothing logged`, **Log this day ›** |

- The link is a real link to `#/eaten/<date>` (`#/eaten` for today), a 44px target, `Open day, Friday, November 6`
  in its accessible name. Both links go to the same place: **Log this day ›** is the same route, worded for what the person
  will do there, and lands on an empty day where #884's Same as… is offered.
- The date and value are hidden from assistive tech on purpose and read through the screen's one `role="status"` region,
  **only when the day is moved by keyboard**: a pointer must never talk (Thrive's #247 rule).
- A selection is cleared by changing range, average or tab, and by tapping the selected day again.

### Choosing a day

- **Pointer:** pressing or dragging on the plot selects the day under the pointer (the nearest day; a whole column is the
  target, not the bar's pixels, so a gap and a 1px bar are as tappable as any). The selected day shows a hairline and, on a
  bar, a marker.
- **Keyboard:** the chart is a single tab stop; Left and Right move a day (Home and End to the ends), and Enter opens the day,
  as Thrive's does. The chart has `role="img"`, a name `Calories, last 30 days`, and the summary line as its description.
- A day with a readout but no bar (a gap) is selectable in the same way.

### By weekday

A card, `By weekday`, `average`: seven bars, Monday first, the mean kcal on counted days with calories on that weekday,
whole numbers above each bar, the weekday's initials below (`M T W T F S S`, full names in the accessible name). A weekday
with no counted day shows no bar and `—`. Under it, how much data is behind it: `Based on 24 days` (counted days with
calories). Fewer than 2 counted days on a weekday makes its bar hatched and its label `1 day`: one value is no average.
The weekday card has no comparison text and no "higher on weekends" sentence: the prototype's line is example copy, and the
app draws no conclusions.

## States

| State | Shows |
|---|---|
| Loading | The controls and tabs, with skeleton cards in `--color-surface-raised` (static under reduced motion). The controls work meanwhile; a change cancels the older request, and a slower, older answer never wins (the store's rule) |
| Populated | As above |
| Nothing logged in the range | Summary `—`, `Nothing logged in this range.`, the chart drawn with every day a gap (so the axis and the gaps are seen), weekday card `—` |
| Nothing logged at all (All) | One card: `Nothing logged yet.` and `Eaten shows what you log, by day.` with a link `Go to Eaten ›`; no chart |
| Failed | `role="status"` in `--color-danger-text`: `Couldn't load your log.` and **Try again**; the controls stay |
| Offline | A failed load is the failed state above. A cached screen is not kept: Trends reads fresh each visit |

A range or average change does not refetch what it already has: the app fetches the widest span it has shown and slices it
(a switch to a shorter range is instant). A longer range fetches again.

## Data

`getFoodLogTotals(from, to)` over the range, one call. `from` is omitted for **All** (the API treats a missing `from` as
the start of the log). Days absent from `days` are gaps; the app adds nothing up except the average, the weekday means and the
weekly means, which are means over counted days. `entries`, `unknown_entries`, `kcal`, `partial` are the fields used.

**No API change.** A range has no cap in `getFoodLogTotals` (the 31-day cap is the MCP tool's). A year of days is at most 365
small rows, so one call is expected to be fine; how long **1Y and All** take as one call was **not measured here**, because it
needs the deployed API and a real sheet, which a refinement session does not have. It is a check for `/develop` against the
deployed app, with the loading state above covering a slow answer. If it proves slow the fallback is two calls (recent, then
the rest), not an API change.

## Copy

| Where | Text |
|---|---|
| Button | `Trends` (accessible name; icon only) |
| Heading | `Trends` |
| Back | `Back to Eaten` |
| Controls | `1W 1M 3M 6M 1Y All`, `Off 7d 14d 30d`; groups named `Range` and `Average` |
| Summary | `kcal a day, on average`, `24 of 29 days logged`, `3 low`, `Not counting today, which is still being logged`, `No days logged in this range.` |
| Chart title | `Calories`, with the range in words beside it: `last 30 days` (`last 7 days`, `last 3 months`, `last 6 months`, `last year`, `all time`) |
| Legend | `Day`, `7-day average` (`14-day`, `30-day`), `Not logged`, `Low` |
| Readout | as the table above |
| Weekday | `By weekday`, `average`, `Based on 24 days`, `1 day`, `—` |
| Weekly mode | `Weekly bars have no average line`, `Week of Nov 2`, `5 of 7 days logged`, `Use 6M or shorter to open a day` |
| Empty | `Nothing logged in this range.`, `Nothing logged yet.`, `Eaten shows what you log, by day.`, `Go to Eaten ›` |
| Failed | `Couldn't load your log.`, `Try again` |

## New tokens

The suite has no chart tokens; Forage defines them in its own `global.css`, as aliases of tokens that exist, so no new
colour is introduced and both themes follow.

| Token | Value | For |
|---|---|---|
| `--chart-bar` | `var(--color-primary)` | Day bars, the weekday bars, the legend's `Day` mark |
| `--chart-line` | `var(--color-text)` | The average line |
| `--chart-grid` | `var(--color-border-light)` | Grid lines |
| `--chart-gap` | `var(--color-text-muted)` | The dashed gap mark |

The hatch stripe width is `--macro-stripe` and its gap `--macro-gap` (both exist, from #864). Every length is otherwise a
token; the chart's own geometry (padding, plot height) lives in the chart's code, as Thrive's `CHART_HEIGHT` does.
#914 adds the macro colours it reuses (`--color-macro-*`) with no new token; #915 names the slot colours it needs.

## Edge cases

- **One logged day.** The average is that day; the summary reads `1 of 29 days logged`; the line is one dot; the weekday
  card has one bar, hatched, `1 day`.
- **A very large day** sets the axis; nothing is clipped.
- **A day from a renamed slot** has no effect here: Energy uses day totals.
- **The date rolls over at midnight with Trends open.** Nothing re-renders by itself; the next range change or visit uses
  the new today, as Eaten does (#825).
- **A range longer than the log** (1Y with two months logged): the earlier days are gaps, not an error. All avoids this.
- **Rapid range changes:** a swap each time; the last tap wins.
- **Time zone:** days are the device's local dates, as Eaten's (#712).

## Out of scope

- Macros, Nutrients, Meals and Foods (#914, #915, #916).
- A Chart | Table view, which Thrive has. Forage's chart has the keyboard and `role="status"` reading; the table is not
  built here, and the epic does not ask for it.
- Target or goal lines, and any sentence that compares or concludes.
- Sharing or moving Thrive's chart, and reading Thrive.
- A Trends tab in the bar (Trends is a screen off Eaten; the epic names a tab as the fallback if cooking and shopping
  trends grow).
- Changes to Eaten beyond the one button (and the header height it needs).
