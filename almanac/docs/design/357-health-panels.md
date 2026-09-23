# 357 — Health: last night, steps and your range

Tokens are from the standing [design-language.md](design-language.md), the ones
#350, #351, #352 and #353 added are in
[350-foundation.md](350-foundation.md#new-tokens),
[351-day-screen.md](351-day-screen.md#new-tokens),
[352-check-in-and-journal.md](352-check-in-and-journal.md#new-tokens) and
[353-todo-panel.md](353-todo-panel.md#new-tokens), and the ones this issue adds
are under [New tokens](#new-tokens). The spec is [../spec.md](../spec.md) (§1,
§2, §6, §8, §9.8, §9.9, §9.11). The behavioural reference is the prototype,
[../prototype.html](../prototype.html): `cardVitals()`, `sleepRow()`,
`vitalRow()`, `stepsRow()`, `cardBody()`, `normal()`, `zone()`, `rangeText()`,
`statusText()`, `rangeBar()`, `pendingRow()`, `eff()`, and the `.row`, `.rbar`,
`.stages`, `.stage-legend`, `.status`, `.met` and `.you` rules. Where the
prototype and the design language disagree, the design language wins, and this
note says where that happened — and it says, once, where this note departs from
the design language too.

This note builds on five settled seams:

- **#350's data interface** — `getDataSource()`, the day-keyed reads, and the
  `Health` shape, which #350 declares demo-first and this issue's to map and
  extend. It adds two fields and no methods; see
  [What this needs from #350, #351 and #352](#what-this-needs-from-350-351-and-352).
- **#351's panel contract** — `slots.lastNight` and `slots.activity`, `Panel`,
  `PanelNote`, `PanelStatus`, `useDayRead` and its shared calls, the card titles
  and chips per day state, and `formatClock` / `formatHoursMinutes` in
  `src/day/format.ts`, which #351 exports for this panel by name. Panels remount
  on every day change and whenever the layout crosses 960px.
- **#352's entry store** — `useEntry(date)`, whose `values.sleep_hours` is the
  check-in as it stands including unsaved changes, and `formatSleepHours`. #352
  also fixes how this card hosts the check-in block.
- **#355's client** — `thriveConfigured()` and `callThrive<T>(action, params?)`,
  the `ApiError` kinds, and the mapping from a refusal onto a `DayRead`.
- **#356's rule for a panel with two sources** — one read drives `PanelStatus`
  and the other only enriches, silently. Here the enriching one is the check-in,
  not a second call to Thrive.

Nothing in this note exists yet to measure. See [Numbers](#numbers).

---

## Where they sit

Two cards, both `#351`'s slots, both on past days and today and neither on a
future day. On a phone they are the first and fourth cards; from 960px they are
the first and second in the left column, with the Journal under them.

Today, after the morning sync:

```
┌──────────────────────────────────────────────┐
│ LAST NIGHT  COROS              synced 8:17 AM│
│ ☾ Sleep                                7h 12m│
│   ▇▇▇▇▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒░                  │
│   ■ Deep 1h 06m  ■ Light 4h 12m              │
│   ■ REM 1h 42m   ■ Awake 0h 12m              │
│   11:24 PM – 6:12 AM · you said 7½ h         │
│   Your range 6h 45m–7h 40m · in range        │
│ ♥ Resting HR                          52 bpm │
│   ▁▁▁▁▁▁▁▁▓▓▓●▓▓▓▓▁▁▁▁▁▁▁▁                   │
│   Your range 49–55 bpm · in range            │
│ ∿ HRV                                  38 ms │
│   ▁▁▁▁●▁▓▓▓▓▓▓▓▓▁▁▁▁▁▁▁▁▁▁                   │
│   Your range 41–50 ms · ↓ below your range   │
├──────────────────────────────────────────────┤
│ YOUR CHECK-IN                          Saved │  #352's block
│ …                                            │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ ACTIVITY  COROS                              │
│ ⺗ Steps                             871 so far│
│   ▇▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁                  │
│   Goal 8,000, set in COROS · 7,129 to go     │
│   So far, as of the 8:17 AM sync             │
└──────────────────────────────────────────────┘
```

A past day, live today — no stages, no bed-to-wake line and no kcal, because
`DailySummary` does not carry them:

```
┌──────────────────────────────────────────────┐
│ OVERNIGHT  COROS             Fri night → Sat │
│ ☾ Sleep                                6h 48m│
│   ▁▁▁●▁▓▓▓▓▓▓▓▓▁▁▁▁▁▁▁▁▁▁▁▁                  │
│   you said 7½ h                              │
│   Your range 6h 45m–7h 40m · ↓ below your … │
│ ♥ Resting HR                          57 bpm │
│ …                                            │
└──────────────────────────────────────────────┘
```

**Two components,** `LastNight` and `Activity`, both in `src/panels/health/`,
both `ComponentType<DayPanelProps>`. They are two cards in two slots with two
titles and different bodies; #356's argument for one component was that its two
day states asked Thrive the same question, and that does not apply across two
cards. They share the row components, the range work and one call.

## The three day states

| | Past | Today | Future |
|---|---|---|---|
| Last night: title | **Overnight** | **Last night** | *#351's own card* |
| Last night: chip | COROS | COROS | COROS |
| Last night: sub | "Fri night → Sat" | "synced 8:17 AM" / "not synced yet today" | — |
| Last night: rows | Sleep, Resting HR, HRV | the same | — |
| Check-in at the foot | yes | yes | no |
| Activity: title | **Activity** | **Activity** | *no card* |
| Activity: sub | none | none | — |
| Activity: rows | Steps | Steps | — |
| Reads | `readHealth(date − 30, date)`, and `useEntry(date)` | the same | none |

The titles, chips and the past sub are #351's table, rendered here because the
slot component renders its whole card. **Today's sub is this issue's**, and it is
the design language's freshness rule: "The Last night card's header says when it
last synced, or 'not synced yet today'."

- **Today's sub is "synced 8:17 AM"** when the day has health data and its
  `synced_at` falls on today in Denver — `formatClock()` (#351), 12-hour, no
  leading zero.
- **"not synced yet today"** when the day has no health data at all.
- **No sub** when the day has health data but no usable `synced_at`. The numbers
  are there and there is simply nothing true to say about when they landed;
  inventing a phrase for it would be worse than the gap.

**The Activity card has no sub.** #351's table gives it none, and the steps row
carries its own "So far, as of the 8:17 AM sync" where the freshness actually
matters — on the one total that grows through the day.

---

## A row

All four rows share one shape, `HealthRow` in `src/panels/health/`.

```
 ☾  Sleep                                        7h 12m
    [stage bar or range bar]
    [stage legend]
    caption
    caption
```

- A `div`, not a button. Three columns: `--icon-lg` wide for the icon,
  `minmax(0, 1fr)` for the content, and an auto column for the value, with
  `--space-sm` between them. `--space-sm` padding top and bottom, `--space-md` at
  the sides, at least `--row-min-h` tall (#353's token, as #353 said this panel
  would reuse it). Rows are separated from each other by a 1px
  `--color-border-light` hairline — hairlines inside a card, not nested cards
  (design language).
- **Nothing here is interactive.** The prototype's rows open Trends, and Trends
  is #359. A row that opens "Coming soon." is worse than one that does not move,
  and naming `#/trends/<metric>` from this issue would settle #359's routes from
  outside it. `HealthRow` takes an optional `href` that nothing passes yet; #359
  passes one and the row becomes an `a` with a chevron, which is the whole of the
  change.
- **Icon** at `--icon-sm` in `--color-text-secondary`, aligned to the first line,
  `aria-hidden`: the prototype's `moon` for Sleep, `heart` for Resting HR, `wave`
  for HRV and `steps` for Steps.
- **Label** at `--text-sm`, weight 650, `--color-text`.
- **Value** at `--text-xl`, weight 650, `--color-text`, on one line, with its unit
  or qualifier after it in `--text-sm` weight 500 in `--color-text-secondary`:
  "52 bpm", "871 so far", "7½ h you said". A row with no value shows "—" in
  `--color-text-muted`. *No `tabular-nums`* — the design language says a column
  of numbers takes it and a lone large number does not, and these are three
  different quantities stacked, not one column.
- **Captions** at `--text-xs` in `--color-text-secondary` with `tabular-nums`,
  `--space-xs` above each, in the order each row gives below.
- **Bars** sit between the label and the captions, `--space-sm` below the label.

**What a screen reader hears** is the label, then the value with its unit, then
the captions, in that order. The bars are `aria-hidden`: the range bar says
exactly what the "Your range …" line says, and the stage bar says exactly what
its legend says. §9.8's rule that a comparison "always carries words, never
colour alone" is the same rule from the other side.

---

## The Last night card

### Sleep

```
☾  Sleep                                        7h 12m
   [stage bar]
   ■ Deep 1h 06m   ■ Light 4h 12m   ■ REM 1h 42m   ■ Awake 0h 12m
   11:24 PM – 6:12 AM · you said 7½ h
   Your range 6h 45m–7h 40m · in range
```

**The value is the watch's**, `formatHoursMinutes(sleep_total_s / 3600)` (#351):
"7h 12m", "9h 05m". Spec §6 — the watch's figure comes first, and the two
measurements never merge.

**The stage bar** renders only when all four of `sleep_deep_s`, `sleep_light_s`,
`sleep_rem_s` and `sleep_awake_s` are present. Four segments, `--stage-bar-h`
tall, 2px apart, each `flex`-sized by its share of the four added together, with
a 3px minimum so a short stage is still a mark. Segment corners are
`--radius-xs`, and the first and last are `--radius-sm` on their outer side, so
the bar reads as one object. Colours are the design language's sleep ramp, and
the order — Deep, Light, REM, Awake — is the ramp's own, darkest to lightest, so
the bar reads as one gradient.

*It is a composition, not a hypnogram.* `DailyHealth` carries four durations, not
a night's sequence, so the bar says what the night was made of and never claims
when each part happened.

**The stage legend** sits under the bar, `--space-xs` below, wrapping, with
`--space-md` between items: an `--stage-key-size` square in the stage's colour,
`--radius-xs`, then the stage's word and its time from `formatHoursMinutes`.
"Awake 0h 12m" keeps the shared format rather than growing a short form of its
own.

**The bed-to-wake caption** is "11:24 PM – 6:12 AM", both from `formatClock()`,
and it renders only when `bedtime` and `waketime` are both set.

**"you said 7½ h"** — spec §6's watch-and-you rule. It appears when the check-in
has hours and they differ from the watch's figure by **half an hour or more**,
compared before any rounding. It is appended to the bed-to-wake caption after
" · ", and is a caption of its own when there is no bed-to-wake line — which is
every live day until thrive#147 ships. The words are `--color-text` at weight
600, so the reader's own answer stands out inside a secondary line.
`formatSleepHours` (#352) gives the "7½ h", and `useEntry` makes it follow the
check-in below without a reload.

**The range line** is last: "Your range 6h 45m–7h 40m · in range", both bounds
through `formatHoursMinutes` and no unit after them.

#### Sleep's bar slot

The Sleep row shows **one** bar: the stage bar when the night has stages, and the
range bar when it does not.

*This is the one place this note departs from the design language*, whose
§ Showing data puts sleep among the four metrics that "show a range bar". Two
stacked bars in one row is a worse row than either, the stage bar is the more
informative of the two, and the range never disappears — it is in the words
underneath on every day it exists, which is what §9.8 actually requires. It also
means the shipped state today, with no stages anywhere, is exactly what the
design language describes.

#### When the watch has nothing

| The day has | Value | Caption |
|---|---|---|
| Watch sleep | "7h 12m" | as above |
| No watch sleep, a check-in | "7½ h" + "you said" | Watch not worn — showing your check-in instead. |
| Neither | "—" | Watch not worn. Add your hours in the check-in below. |

The stand-in is labelled in the value itself, not only in the caption, so a
glance can never read it as the watch's (spec §6). Neither case shows a bar: the
range is the watch's series and a self-report is a different measurement.

### Resting HR and HRV

```
♥  Resting HR                                   52 bpm
   [range bar]
   Your range 49–55 bpm · in range
```

The value is rounded to a whole number, with "bpm" or "ms" after it. Then the
range bar, then one caption:

| The 30 days before the date | Caption |
|---|---|
| 14 or more values, the day's value inside the range | Your range 49–55 bpm · in range |
| 14 or more, outside it | Your range 49–55 bpm · ↑ above your range · ↓ below your range |
| Fewer than 14 | Building your range — needs 14 nights. *(no bar)* |
| No reading that day | No reading — needs the watch overnight. *(no bar, value "—")* |

- The arrow is the prototype's `up` or `down` at `--icon-xs`, `aria-hidden`; the
  words carry it.
- "above your range" / "below your range" and their arrow are weight 700, and
  turn `--color-warning` **only in the unwelcome direction** — resting HR above,
  HRV below (spec §9.8). The range bar's dot turns `--color-warning` at the same
  moment and never on its own.
- The bounds are formatted by the metric, with the unit after them for bpm and ms.

### A day the watch has nothing for at all

A past day with no health data shows one `PanelNote` with the info icon, in place
of all three rows:

> No watch data for this day.

The check-in still renders under it, exactly as on any other past day.

*Why the card collapses here and the Activity card does not:* three rows each
repeating one sentence is noise, while Activity has a single row whose label is
what tells you which number is missing.

*The prototype adds "COROS history starts Sep 15, 2025."* It is dropped. No read
answers when health history begins — `getHistoryDateRange` is the `Workouts`
tab's span — so only demo mode could ever show that sentence, and a string that
exists only in the demo is a string that will be wrong in production.

### Before today's first sync

When today has no health data at all, every row in both cards becomes a pending
row — the label, the caption **"Arrives with the next sync."**, and "—" in
`--color-text-muted` — and the card's sub reads "not synced yet today".

**Including Sleep, and including when the check-in has hours.** Spec §9.9 is
categorical: until the first sync lands, a health row says it is waiting and
shows no stand-in. The check-in is two rows further down the same card, with your
hours in it, so nothing is hidden — but the watch's line must not answer for the
watch before the watch has spoken, and a check-in promoted into the sleep row
before the sync and demoted after it would change under you mid-morning.

### The check-in

`slots.checkIn` (#352) is the card's **last child**, full width, outside any
padded container — the block draws its own 1px `--color-border-light` top border,
`--color-surface-raised` background and padding — on past days and today, and
**whatever state this card's own reads are in**: loading, error, session-expired,
pre-sync or ready. It reads its own data and it is the one thing on the card that
writes.

---

## The Activity card

One row, Steps, with the COROS chip and no sub.

### Today

```
⺗  Steps                                     871 so far
   [goal bar, when there is a goal]
   Goal 8,000, set in COROS · 7,129 to go
   So far, as of the 8:17 AM sync
```

- The value is the count so far, grouped with `toLocaleString('en-US')`, with
  "so far" after it as the qualifier.
- **No range bar and no range words on today.** A part-day total against a
  whole-day range says "below your range" every morning, which is true of the
  clock and not of you. The prototype makes the same choice, and the caption
  already says the count is partial.
- The sync caption is always last: "So far, as of the 8:17 AM sync",
  `formatClock()` on `synced_at`. When there is health data but no usable
  `synced_at`, the caption is omitted along with the card's sub.

### A past day

```
⺗  Steps                                        9,412
   [range bar, or the goal bar when the day has a goal]
   Your range 6,800–10,200 · in range
   2,412 kcal burned
```

Captions in order, each only when it has a value: the goal line, the range line,
then the kcal line. The range line uses the same words and the same
`--color-warning` rule as the vitals, except that steps have **no unwelcome
direction** — spec §9.8 names resting HR, HRV and sleep and not steps, so a step
count outside the range is stated and never coloured.

"Building your range — needs 14 days." replaces the range line below 14 values.
*A new string,* parallel to the vitals' "needs 14 nights.", because steps are not
a night and saying so would be nonsense.

### The step goal

When the day's health carries a `step_goal` (spec §9.11), a progress bar toward
it replaces the range bar, and the goal line reads:

| | String |
|---|---|
| Today, not met | Goal 8,000, set in COROS · 1,688 to go |
| A past day, not met | Goal 8,000, set in COROS · 82% of goal |
| Either, met | Goal 8,000, set in COROS · ✓ met |

"met" and its `check` icon at `--icon-xs` are `--color-success` at weight 700 —
the design language's "goal met" use of that colour, with its word beside it. The
percentage is rounded to a whole number. The range line still appears on a past
day under the goal line: the goal replaces the *bar*, as the design language
says, and not the comparison.

**almanac never sets or stores a goal** (spec §9.11). `step_goal` is `null` in
live mode until thrive#148 says whether COROS sends one, and the row sits against
your range, which is the designed state and not a fallback.

### When the count is missing

| The day | Value | Caption |
|---|---|---|
| Today, before the first sync | "—" | Arrives with the next sync. |
| A past day with health but no step count | "—" | No step count for this day. |
| A past day with no health at all | "—" | No watch data for this day. |

---

## Your range

Spec §9.8, and the one comparison the day screen makes. It lives in
**`src/data/range.ts`**, a new file this issue adds, because #358 shades the
calendar by a health metric and #359 draws the same band behind every chart, and
neither should import a statistic out of a panel's folder. It reads nothing
itself — it takes a map and a picker — so it depends on no source.

```ts
export const RANGE_DAYS = 30;
export const RANGE_MIN_VALUES = 14;

export interface Range { mean: number; lo: number; hi: number; min: number; max: number; n: number }
export type Polarity = 'up' | 'down' | null;

export function valuesBefore<T>(
  data: Map<IsoDate, T>, date: IsoDate, days: number, pick: (value: T) => number | null,
): number[];

export function yourRange(values: number[]): Range | null;

export function zoneOf(
  value: number, range: Range, polarity: Polarity,
): { zone: 'below' | 'within' | 'above'; attention: boolean };
```

- **`valuesBefore`** walks `addDays(date, −1)` back to `addDays(date, −days)`
  (#350's helper), takes `pick` of each day the map has, and keeps the finite
  ones. **The date itself is never in its own range.** A day the map has no key
  for contributes nothing — it is not a zero.
- **`yourRange`** returns `null` below `RANGE_MIN_VALUES`, which is what
  "Building your range" renders. Otherwise `mean` is the arithmetic mean and the
  deviation is the **population** standard deviation, √(Σ(x−mean)²/n) — the
  prototype's `normal()`. The band describes the days you have; it is not an
  estimate of a wider population, and at n ≥ 14 the difference from the sample
  form is under 4% either way.
- **`zoneOf`** is `below` under `lo`, `above` over `hi`, `within` otherwise.
  `attention` is true only for `below` with polarity `'up'` and `above` with
  polarity `'down'` — spec §9.8's unwelcome direction, and the only thing that
  may turn anything `--color-warning`.

| Metric | Polarity | Unwelcome |
|---|---|---|
| Resting HR | `'down'` | above |
| HRV | `'up'` | below |
| Sleep | `'up'` | below |
| Steps | `null` | neither |

### The range bar

`RangeBar` in `src/panels/health/`, `aria-hidden`, the design language's
treatment exactly: a track in `--color-sunken`, the band in
`--color-band-strong`, and the value as a dot in `--color-primary`, turning
`--color-warning` when `zoneOf` says so.

- The track is `--range-bar-h` tall with `--radius-sm` corners and fills the
  content column. The band is absolutely positioned from `lo` to `hi` with the
  same radius.
- The dot is `--range-dot-size` across, centred on the value, with a 2px ring in
  `--color-surface` so it reads against the band.
- **The scale** runs from `min(range.min, value, range.lo)` to
  `max(range.max, value, range.hi)`, then 12% of that span added at each end (or
  1 unit when the span is zero) — the prototype's `rangeBar()`. It is chosen per
  row and per day, so the bar shows the shape of the comparison and is never
  comparable between two rows. That is what the words are for.

### The goal bar

`GoalBar`, the same track and radius, filled from the left in `--color-primary`
to `min(1, count / goal)`, `aria-hidden`. A count past the goal fills it and
stops; the words say "met".

---

## Reading Thrive

### One read, for both cards and for the range

```ts
useDayRead('readHealth', addDays(date, -RANGE_DAYS), date)
```

Both cards ask for exactly that, so they share one call (#351's Shared calls —
same name, same `from`, same `to`, within one session). The day is
`data.get(date)`; the range is `valuesBefore(data, date, RANGE_DAYS, pick)`.

**Why one read rather than two.** #356 splits a panel's reads because its second
one costs a call per planned workout. Here the wide range and the single day are
the same Apps Script action against the same tab: `getDailySummaries` reads the
whole `DailySummary` tab with `getAllRows` and filters in memory
(`apps-script/src/daily-summary.js`), so a 31-day range costs exactly what a
1-day range costs, and the day's row is a strict subset of the window's answer. A
second read would ask Thrive again for rows it had already sent, and spend a
second call out of a 60-a-minute quota that fast swiping can reach.

The consequence is that the day's numbers and their ranges arrive together and
share one status, which is the honest shape: they came from one answer.

### The enriching read

`useEntry(date)` (#352), the same call the check-in and the journal make, joined
rather than sent again because all three mount in one render (#351). **It never
drives the card's status.** If it is loading, failed or session-expired, the
"you said" suffix and the check-in stand-in are absent and nothing else changes —
#356's rule, one level over. The check-in block below has its own message for it,
and a second copy of that message inside the sleep row would say the card is
broken when the thing you came for is right there.

### The live read

`readHealth` is a `DataSource` method #350 already declares, attached in
`src/data/live.ts` only when `thriveConfigured()` is true. Its implementation
lives in **`src/data/liveHealth.ts`**, a new file this issue owns, holding the
row type, the mapping and the read — as #353 put Hive's in `liveHive.ts` and #356
put Thrive's workout reads in `liveThrive.ts`. `live.ts`'s whole diff is one
import and one attachment; `liveThrive.ts` is untouched. The panel reads only
through `getDataSource()` and never calls `callThrive` itself.

| Read | Signature | Calls |
|---|---|---|
| `readHealth` | `(from: IsoDate, to: IsoDate)` | `getDailySummary({ from, to })` — **one, for any range** |

`getDailySummary` is on thrive#144's allow-list for a token caller, so nothing
here needs a capability that issue does not already give.

### Mapping a row

Thrive's API returns every cell as a **string**, `''` for unset — `cell()` in
`apps-script/src/utils.js`. `ThriveDailySummaryRow` in `liveHealth.ts` types the
fields this panel uses, all as `string`, and `toHealth(row)` maps one row into
#350's `Health`:

1. **Numbers** — `steps`, `resting_hr`, `hrv`, `sleep_total_s`. Trimmed, then
   `Number(...)`: `''` becomes `null`, a value that is not finite becomes `null`,
   and a genuine `0` stays `0`. #356's rule, and the whole of "blank is not zero"
   on this side.
2. **`synced_at`** — `computed_at`, kept as the ISO 8601 instant Thrive wrote
   (`isoNow()`), or `null` when it is blank or not a date. See
   [What `computed_at` is and is not](#what-computed_at-is-and-is-not).
3. **Everything else is `null`** — `calories`, the four `sleep_*` stage fields,
   `bedtime`, `waketime`, `step_goal`, `vo2max`, `training_load`. `DailySummary`
   has no column for the first seven, and the last two are #359's. This is the
   "absent, not empty" half of the issue: the stage bar, the legend, the
   bed-to-wake line and the kcal line simply do not render, and no height is
   reserved for them. #356 reserves a line because its counts arrive on a second
   call moments later; these arrive when thrive#147 ships, and a permanent gap is
   not a wait.

**Two kinds of row get no key**, the second of which matters:

- a row whose `date` is not a real `YYYY-MM-DD`, since it cannot be keyed by day;
- **a row with no health value at all** — `steps`, `resting_hr`, `hrv` and
  `sleep_total_s` all `null`. `DailySummary` has a row for any day with
  activities *or* health, so a day you logged a walk on before the watch existed
  has a row full of activity totals and no health. #350's rule is that a date
  with nothing gets no key, and a day with no health data is, to this panel,
  nothing. It is also what makes "not synced yet today" and "No watch data for
  this day." exact rather than approximate: **no key means nothing has arrived.**

Rows are then keyed by `date` into a `Map<IsoDate, Health>`.

### What `computed_at` is and is not

`DailySummary.computed_at` is when the **rollup** last rebuilt that day's row, not
when the watch data arrived. It stands in for the sync time because the same job
does both in the same pass — the sync loop upserts `DailyHealth` for a day and
then rebuilds `DailySummary` for it (`coros-sync-plan.md` §10) — so the two are
seconds apart, and it is the only timestamp almanac can read today.

Two consequences, both handled above rather than hidden:

- It is stamped once for a whole rebuild range, so **every day in the rolling
  window carries the same value.** That is why it is used only on today, where
  the sub asks "when did this land", and never on a past day, whose sub is the
  night it covers.
- A rebuild triggered by something other than a sync would move it. Today's row
  is rebuilt by the sync job at about 3:17 AM Denver, so in practice it is the
  sync.

`DailyHealth.synced_at` is the real answer and arrives with
[thrive#147](https://github.com/luketmoss/thrive/issues/147). Nothing in this
panel changes when it does: the field is already called `synced_at`, and
`liveHealth.ts` swaps where it is read from.

### What it costs

| Day | Calls, for both cards together |
|---|---|
| Any past day | 1 — `getDailySummary` over 31 days |
| Today | 1 |

Plus the `readEntries` call the check-in, the journal and the sleep row share
(#352). At a second or more per Apps Script call
(`implementation-plan.md` § Risks) and 60 Sheets reads a minute (#351), this is
the cheapest panel on the day screen, and it is the one with the widest range.

### What a failure looks like

Straight from #355 and #351, with `source` as the string **"Thrive"**:

| Cause | `DayRead` | Both cards show |
|---|---|---|
| `VITE_THRIVE_API_URL` empty → the method is never attached | `not-connected` | "Thrive isn't connected yet." |
| The session expired, or `code: 'token_invalid'` | `session-expired` | "Reconnect to load this." |
| `token_forbidden`, `read_only`, `token_unavailable`, any other `success: false` | `error` | "Couldn't load from Thrive." · Try again |
| `fetch` rejected with `navigator.onLine` false | `error`, `offline` | "You're offline — couldn't load from Thrive." · Try again |
| Non-200, non-JSON after one retry, or 20s | `error` | "Couldn't load from Thrive." · Try again |

**"Thrive", not "COROS".** The chip says COROS because COROS measured the
numbers; the status says Thrive because Thrive is who almanac asked and where a
failure is diagnosed. almanac never talks to COROS, so "Couldn't load from
COROS." would be false.

**The card is `PanelStatus` and nothing else until `readHealth` is `ready`** — no
rows, no sub. Except the check-in, which #352 requires this card to render in
every state. An empty result is `ready` and says this panel's own words; a
refusal says it could not load. #350's rule that absent means "not connected",
never an empty day, is the same rule one level up.

**Until thrive#144 ships**, a live request carrying an access token and no `key`
is refused by Thrive's current `validateApiKey`, which lands as `error`. That is
the correct thing to show: the source is connected and is saying no. Demo mode
meanwhile shows every state in full, so the panel can be built, tested and merged
before the token check exists — and before the COROS sync runs at all, which is
the point the implementation plan makes about this issue.

### What this needs from #350, #351 and #352

Two fields on one shape, and nothing else. **No new `DataSource` method and no
changed signature.**

- **#350, `src/data/types.ts`:** `Health` gains
  `synced_at: string | null` — an ISO 8601 instant, when this day's health data
  arrived — and `step_goal: number | null` (spec §9.11). Everything else the
  cards use is already there: `resting_hr`, `hrv`, `steps`, `calories`,
  `sleep_total_s`, the four `sleep_*` stage fields, and `bedtime` / `waketime`.
  #350 declares these shapes demo-first and this issue's to map and extend, so
  this is the extension it named, not a change to it.
- **#350, `src/data/demo/`:** today's health gains a sync time, a part-day step
  count and a goal. #350's note leaves `eff()` and the step goal to this issue by
  name. See [Demo mode](#demo-mode).
- **#351:** nothing. `useDayRead` already accepts `'readHealth'`, and
  `formatClock` and `formatHoursMinutes` are already exported for this panel.
- **#352:** nothing. `useEntry(date)` and `formatSleepHours` are used exactly as
  #352's note specifies, and the check-in block is hosted exactly as it asks.

### Environment

None. `VITE_THRIVE_API_URL` (#355) is the only variable involved and it already
exists; empty is a supported state, not a misconfiguration. `VITE_THRIVE_APP_URL`
is deliberately unused — nothing on these cards links out, because COROS has no
screen to open and the numbers' home is almanac's own Trends (#359).

---

## Demo mode

#350's generator already produces COROS health from 371 days before today through
today, with about 5% of nights not worn, and steps and calories on past days
only. This issue adds what #350 left it: the prototype's `eff()` for today, and
the step goal.

| Field | Demo value |
|---|---|
| `synced_at` | Today at 08:17 in Denver — the prototype's "normal" scenario, and #351's own example of this sub |
| `steps`, today | The prototype's `stepsSoFar(497)` ≈ 871 — the morning sync, with the day barely started |
| `calories`, today | `null`. The day is not over |
| `step_goal` | 8,000 (the prototype's `STEP_GOAL`) from 60 days before today onward, and `null` before that |
| `bedtime`, `waketime` | `build()`'s `h.bed` and `h.wake`, as `'HH:MM'` in Denver |
| the four `sleep_*` stages | `build()`'s, unchanged |

**Why the goal starts 60 days ago** rather than always or never: it is what
actually happens — you set a goal in the COROS app one day — and it makes both
designed states reachable by moving between days, the goal bar on recent days and
the steps range bar before that. A demo with the goal always on would hide the
state live mode is in today; always off would hide the one nothing else can show.

Every state is reachable without a request leaving the page:

- **Today**, synced at 8:17 AM, last night complete with stages and bed-to-wake
  times, steps at 871 of 8,000.
- **Yesterday and back**, complete days with kcal, ranges, and the occasional
  night the watch was not worn (~5%), which shows the check-in stand-in on days
  the generator also wrote an entry for and "—" on the rest.
- **372 days ago and earlier**, "No watch data for this day." in both cards.
- **Around 358 days ago** — within 14 days of where health starts — "Building
  your range" on every row.
- **Values outside the range in both directions**, since the generator's illness
  and camping spells move resting HR, HRV and sleep together.

The pre-sync state is the one demo mode cannot reach, since the generator gives
today health data at load: it is the suite's, over a map with no key for today.

---

## What #358 and #359 can reuse

- **`src/data/range.ts` whole.** #358's calendar shading and #359's band are the
  same statistic over the same map. `RANGE_DAYS` and `RANGE_MIN_VALUES` are
  exported so neither retypes 30 or 14.
- **`readHealth` over a range is one call**, and the map is day-keyed, so a month
  is one call and a year is one call. It is the read #358's shading and #359's
  recovery, sleep, activity and fitness charts all want.
- **`liveHealth.ts`'s `toHealth`** is where `vo2max` and `training_load` join
  `Health` when #359 wants them — `DailySummary` already carries
  `training_load`, and it is `null` here only because nothing on the day screen
  shows a COROS score (decided 21 September).
- **`HealthRow`'s `href`.** #359 passes one, the row becomes a link with a
  chevron, and every row on both cards opens its metric's chart. That is the one
  change, and it is why the prop exists now.
- **Not the sub.** "synced 8:17 AM" is the day screen's question. A month or a
  year has no single sync time.

---

## Edge cases

- **Midnight in Denver, with today on screen.** The `today` signal rolls over,
  the day state goes from today to past, both panels remount and read the new
  window, the Last night sub becomes "Fri night → Sat", the steps value loses
  "so far" and gains its range, and the new today is pre-sync until the job runs.
- **A sync lands while the tab is open.** Coming back to the tab re-reads in the
  background (#351), so the pending rows fill in and the sub changes from "not
  synced yet today" to "synced 8:17 AM" without a reload. Nothing here starts a
  sync (#360).
- **The watch was worn but recorded no sleep** — `sleep_total_s` blank, resting
  HR and HRV present. Sleep falls to the check-in or to "—"; the other two rows
  are normal. The card never infers one from another.
- **A night of exactly 30 minutes' disagreement** with the check-in shows "you
  said", since the rule is half an hour **or more**.
- **A check-in of 0 hours** against a watch figure is a real answer (#352) and
  reads "you said 0 h" when they differ by half an hour or more.
- **Zero steps on a past day.** A genuine `0` stays `0` (#356's parse rule), so
  the row reads "0" and compares against the range like any other value. A blank
  cell reads "No step count for this day." Blank is not zero, at the row as well
  as at the mapping.
- **A step count past the goal.** The bar fills and stops, the line says "met",
  and the value is the real count.
- **Every one of the 30 days before the date has a value, and they are all the
  same.** The deviation is zero, `lo` and `hi` are equal, and the bar's scale
  falls back to its 1-unit padding so the band is a line and the dot sits on it.
  The words read "in range", which is true.
- **A day near where COROS history begins** has fewer than 14 values and shows
  "Building your range" on every row, including steps with "needs 14 days."
- **A hand-edited `DailySummary` row.** It is a derived tab that the sync
  rebuilds, so a hand edit is transient; almanac reads whatever is there and
  applies the same parse. A non-numeric cell reads as `null`, never 0.
- **Offline.** Both cards show the offline line and Try again, and so does every
  other card at the same moment, which is why #351 does not make it an alert. The
  check-in still renders and still holds what you typed (#352).
- **The session has ended.** "Reconnect to load this."; after Reconnect both
  cards read again by themselves, on one shared call (#351).
- **Swiping fast across days.** #351 drops answers for days you have left and
  rejoins calls still in flight. Both cards hold the same key, so a day you
  return to before its call lands is joined, not read again.
- **Crossing 960px.** Both panels remount and ask for the same key, joining
  whatever is in flight. Nothing is read twice, and the check-in keeps its focus
  and its text (#352).
- **A future day.** Neither component is ever mounted; #351 renders the Overnight
  card itself and there is no Activity card.

---

## Copy

| Where | String |
|---|---|
| Card titles | Last night · Overnight · Activity *(#351)* |
| Chip | COROS *(#351)* |
| Sub, today, synced | synced 8:17 AM |
| Sub, today, before the first sync | not synced yet today |
| Sub, a past day | Fri night → Sat *(#351)* |
| Row labels | Sleep · Resting HR · HRV · Steps |
| Sleep value | 7h 12m |
| Sleep value, the check-in standing in | 7½ h you said |
| Stage legend | Deep 1h 06m · Light 4h 12m · REM 1h 42m · Awake 0h 12m |
| Bed to wake | 11:24 PM – 6:12 AM |
| Watch and you | you said 7½ h |
| Watch not worn, with a check-in | Watch not worn — showing your check-in instead. |
| Watch not worn, without one | Watch not worn. Add your hours in the check-in below. |
| Vital values | 52 bpm · 38 ms |
| In range | Your range 49–55 bpm · in range |
| Out of range | Your range 49–55 bpm · ↑ above your range · ↓ below your range |
| Sleep's range | Your range 6h 45m–7h 40m · in range |
| Steps' range | Your range 6,800–10,200 · in range |
| Too few values, a night | Building your range — needs 14 nights. |
| Too few values, steps | Building your range — needs 14 days. |
| No reading | No reading — needs the watch overnight. |
| No health at all, a past day | No watch data for this day. |
| Before today's first sync | Arrives with the next sync. |
| Steps value, today | 871 so far |
| Steps sync caption | So far, as of the 8:17 AM sync |
| Steps, a past day with no count | No step count for this day. |
| Goal, today | Goal 8,000, set in COROS · 1,688 to go |
| Goal, a past day | Goal 8,000, set in COROS · 82% of goal |
| Goal, met | Goal 8,000, set in COROS · met |
| Calories | 2,412 kcal burned |
| Not connected | Thrive isn't connected yet. |
| Loading | Loading… |
| Error | Couldn't load from Thrive. |
| Error, offline | You're offline — couldn't load from Thrive. |
| Error action | Try again |
| Session ended | Reconnect to load this. |

The last five are #351's `PanelStatus` sentences with "Thrive" in them, not new
strings. "Arrives with the next sync.", "Your range 49–55 bpm · in range" and
"No watch data for this day" are the design language's settled § Words. Sentence
case throughout, and nothing on either card is a verdict: they show the night and
the day and never rate them (spec §1, §9.10).

---

## Numbers

almanac is still the scaffold #350 will replace — `almanac/src` holds
`main.tsx`, `App.tsx`, `App.test.tsx`, `test-setup.ts` and an empty
`components/`, and there is no `.claude/launch.json` — so nothing in this note
could be measured against a running app. Every number is **unmeasured until
built**, and each comes from a source:

| Number | Source |
|---|---|
| 30 days, 14 values, mean ± 1 SD | spec §9.8 |
| Half an hour, for "you said" | spec §6 via the issue body; the prototype's `sleepRow()` |
| The population SD (÷ n, not n−1) | the prototype's `normal()`; chosen here, with the reason above |
| The range bar's scale: min/max of the window, then 12% padding each side | the prototype's `rangeBar()` |
| 8px track, 14px dot, 10px stage bar, 8px legend key, 13px inline glyph | the prototype's `.rbar`, `.rbar .mk`, `.stages`, `.stage-legend b`, `.ico-xs` — all four tokens below |
| 3px minimum stage segment; 2px between segments | the prototype's `.stages span` |
| 48px minimum row height (`--row-min-h`); rows ≥ 44px, touch targets ≥ 40px | #353's token, from the prototype's `.todo`; design-language § Scale |
| The 960px two-column breakpoint | design-language § Layout; #351 renders it |
| 300ms before "Loading…" | #351 |
| 8:17 AM and 8,000 steps in demo mode | the prototype's `SYNC_AT.normal` (497 minutes) and `STEP_GOAL` |
| ≈871 steps at 8:17 AM in demo mode | the prototype's `stepsSoFar(497)` |
| 60 days for the demo's goal | chosen here: long enough to sit inside a month's calendar (#358) and short enough that both states are a few swipes apart |
| 371 days of demo health, ~5% of nights not worn | #350's generator, from the prototype's `build()` |
| 60 read requests a minute per user | the Google Sheets read quota, as #351, #352, #353 and #356 cite it |
| A second or more per Apps Script call | implementation-plan.md § Risks |
| One call for a 31-day range | `getDailySummaries` reads the whole tab with `getAllRows` and filters in memory (`apps-script/src/daily-summary.js`) |

`/test` checks the row height, the bar heights and the tap targets in the running
app, in demo mode, with `getBoundingClientRect()` at a 360px-wide viewport — the
width #351, #352, #353 and #356 already check at.

---

## New tokens

The design language, #350, #351, #352, #353 and #356 have no token for these
five. Each value comes from the source named, and `global.css` defines it on
`:root` like the rest.

| Token | Value | For | Source |
|---|---|---|---|
| `--range-bar-h` | `8px` | the range bar's and goal bar's track height | prototype `.rbar` |
| `--range-dot-size` | `14px` | the value dot on a range bar | prototype `.rbar .mk` |
| `--stage-bar-h` | `10px` | the sleep stage bar's height. Taller than the range bar on purpose: it is four things, not one | prototype `.stages` |
| `--stage-key-size` | `8px` | the square in the stage legend. Not `--board-square-size`, whose name says it marks a Hive board | prototype `.stage-legend b` |
| `--icon-xs` | `13px` | an icon inline in `--text-xs` caption text — the ↑ and ↓ on a range line, the check on "met". `--icon-sm` at 18px towers over 12px text | prototype `.ico-xs` |

**No new colours.** The sleep ramp (`--sleep-deep`, `-light`, `-rem`, `-awake`),
`--color-band-strong`, `--color-sunken`, `--color-primary`, `--color-warning` and
`--color-success` are all the design language's, used for exactly what it names
them for.

**Four new icons**, all from the prototype's set: `wave` (HRV), `steps`, `up` and
`down`. They join the `plus`, `ext`, `check` and `info` #353 brought in, the
`heart` #356 brought in, and the `moon` and `alert` #350 and #351 already use.

Sizes the prototype uses off the scale are brought onto it instead of getting
tokens, as #351, #353 and #356 did: the row's 22px icon column becomes
`--icon-lg`; its 12px column gap and 12px vertical padding become `--space-sm`;
the bars' 9px top margin becomes `--space-sm`; the legend's 6px top margin and
its 2px row gap become `--space-xs` and its 12px column gap `--space-md`; the
bars' 4px radius becomes `--radius-sm` and the stage segments' 2px becomes
`--radius-xs` (#353).
