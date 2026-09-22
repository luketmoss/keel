# almanac design language

Standing reference, not an issue note. It covers every issue, which is why it
has no number, and it outranks any single note. Per-issue notes reference tokens
from here by name instead of restating values.

The prototype this was settled on is
<https://claude.ai/artifact/Dk2WztPMbKAQLscNCKmnyP> (22 September 2026), and its
source is [`../prototype.html`](../prototype.html). Where this document and the
prototype disagree, this document wins.

## The idea

**One of the suite, told apart by its colour.** Almanac is a Preact app with its
own `global.css`, built the way Thrive and Hive are: the same neutrals, scales,
card shapes and bottom navigation, so moving between the apps on a phone feels
like one family. The accent is the only thing that says "this is almanac".

It deliberately does **not** use the Keel Alpenglow foundation that cairn uses
(spec §9.6). Alpenglow is dark only for now, lets its one accent mark
interaction and nothing else, and is meant to be shared by every app with no
overrides. Almanac needs a light theme for morning reading, and more colours to
tell data apart. Neither fits.

## Colour

Light is the base theme; dark is designed, not inverted. Both follow the
system setting.

### Accent — amethyst

Two tiers, as in Hive: `--color-accent` is the brand (logo, same in both
themes); `--color-primary` is everything interactive, tuned per theme for
contrast.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-accent` | `#9D5CF0` | `#9D5CF0` | logo hexagon only |
| `--color-primary` | `#7B3FC4` | `#C89BFF` | links, selected states, focus, chart lines |
| `--color-primary-hover` | `#6A33AB` | `#D9B9FF` | hover on primary fills and text |
| `--color-primary-light` | `#F3ECFD` | `#2A1D3D` | selected-chip fill, "Today" pill |
| `--color-on-primary` | `#FFFFFF` | `#1E0B33` | text and icons on a primary fill |
| `--color-band` | `color-mix(in srgb, var(--color-accent) 12%, transparent)` | `color-mix(in srgb, var(--color-primary) 13%, transparent)` | "your range" band in charts |
| `--color-band-strong` | the same at 28% | the same at 30% | "your range" band on range bars |

Measured: `--color-primary` on white 6.27, on `--color-bg` 5.59, on
`--color-primary-light` 5.44; dark `--color-primary` on `--color-surface` 7.92,
and `--color-on-primary` on it 8.33. All pass AA.

Taken colours, for the next app: Hive gold, Thrive blue (migrating from orange),
Forage green, cairn orange. Violet was rejected for sitting about 30° from
Thrive's blue. Rose and berry sit too close to the danger red.

### Neutrals

Thrive's values, with one correction: `--color-text-muted` is darkened, because
Thrive's own `#8e99a4` fails AA (luketmoss/thrive#99 and #105).

| Token | Light | Dark |
|---|---|---|
| `--color-bg` | `#F0F2F5` | `#121212` |
| `--color-surface` | `#FFFFFF` | `#1A1A1E` |
| `--color-surface-raised` | `#F7F8FA` | `#222226` |
| `--color-sunken` | `#E9ECF0` | `#2A2A30` |
| `--color-border` | `#DADCE0` | `#34343A` |
| `--color-border-light` | `#E8EAED` | `#2A2A2F` |
| `--color-text` | `#1F1F1F` | `#E8EAED` |
| `--color-text-secondary` | `#5F6368` | `#A4AAB1` |
| `--color-text-muted` | `#62686F` | `#8F959C` |

### Status

Status colours mean good, warning or bad, and never identify a series. Each one
ships with an icon and a word, never colour alone.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-success` | `#2E7D32` | `#66BB6A` | goal met, blood pressure "Normal", effort Easy |
| `--color-warning` | `#A05D00` | `#FFB74D` | outside your range in the unwelcome direction, "Elevated", effort Medium |
| `--color-serious` | `#B4480F` | `#FF9A6B` | blood pressure "Stage 1" |
| `--color-danger` | `#C62828` | `#EF5350` | blood pressure "Stage 2", effort Hard |
| `--color-overdue` | `#B71C1C` | `#FF6B6B` | Hive's overdue red, for late items |

Each has a `-tint` companion for chip backgrounds.

### Data colours

These are data, not chrome, so they may carry their own hues.

- **Workout type badges** are copied from Thrive's `global.css`
  (`.badge-weight`, `-stretch`, `-bike`, `-hike`, `-run`, `-walk`), light and
  dark, so a ride looks the same in both apps. They always carry their word.
  As bare dots they fail colour-blind separation (weight red and run rose are
  close), so the calendar uses **icons** for workout types, not coloured dots.
- **Hive boards** use each board's own colour from Hive, as a small square
  beside the board name. Never as a fill.
- **Sleep stages** use one indigo ramp from light (awake) to dark (deep),
  checked as an ordered ramp in both themes:

| Token | Light | Dark |
|---|---|---|
| `--sleep-awake` | `#94A4F6` | `#C9D2FF` |
| `--sleep-rem` | `#6F81EA` | `#95A3FF` |
| `--sleep-light` | `#4555CF` | `#6474EA` |
| `--sleep-deep` | `#252C8A` | `#3A45B8` |

- **Calendar shading** is one hue: `--color-primary` mixed into
  `--color-surface` at 16%, 36%, 62% and 90%, in four equal-count groups over all
  history. Days with no data get a hatch, never the lightest step.

### Chart chrome

| Token | Light | Dark | Use |
|---|---|---|---|
| `--chart-grid` | `#E8EAEE` | `#2A2A30` | gridlines, 1px, solid |
| `--chart-axis` | `#C6CAD0` | `#3D3D44` | baseline, ticks, the 80/120 reference lines |
| `--chart-dot` | `#A0A6AE` | `#6D737B` | each day's value when a rolling average is drawn |

## Scale

Thrive's scales, unchanged: spacing `--space-xs` 4 · `sm` 8 · `md` 16 · `lg` 24 ·
`xl` 32 · `2xl` 48; radius `--radius-sm` 4 · `md` 8 · `lg` 16 · `full`; type
`--text-xs` 12 · `sm` 14 · `base` 16 · `lg` 18 · `xl` 20 · `2xl` 24, plus
`--text-3xl` 30 for the day's name only. System font stack. Columns of numbers
use `tabular-nums`; a lone large number does not.

Touch targets are at least 40px, and rows are at least 44px.

## Layout

- **Phone first.** Three tabs in a bottom bar: **Day**, **Calendar**,
  **Trends**. From 960px wide the tabs move into the top bar, and the day screen
  becomes two columns.
- **Day screen order** is the same for past, today and future, so it scans the
  same every time: Last night → Training → To do → Body & activity → Journal.
  In two columns: left is Last night, Body & activity and Journal; right is
  Training and To do.
- **Header**: the day's name, the date with a relative pill ("Today",
  "Yesterday", "In 3 days"), and a sunrise · sunset · daylight line. Below it, a
  Monday-first week strip: tap a day, or swipe it to change weeks. Swiping the
  day body changes the day. On desktop, the arrow keys change the day and `t`
  returns to today.
- **Cards** are for sources: one per panel, with a small source chip (COROS,
  Thrive, Hive, Withings). Inside a card, rows are separated by hairlines, not
  nested cards. The exception is Thrive activities, which are cards so a planned
  workout can wear Thrive's dashed border.

## Showing data

These rules are the spec's discipline, made visible.

- **Blank is not zero.** A missing value shows as `—` with words saying why:
  "Watch not worn", "No reading", "No watch data for this day". An unset
  check-in field shows as unselected, never as the middle option.
- **Freshness.** Until a sync brings today's number, its row says **"Arrives
  with the next sync."** — never a stand-in value. A total that grows through
  the day says "so far", with the sync time: "So far, as of the 1:17 PM sync".
  The Last night card's header says when it last synced, or "not synced yet
  today".
- **Your range.** Resting HR, HRV, sleep and steps show a range bar: the track
  in `--color-sunken`, the band in `--color-band-strong`, and today's value as a
  dot in `--color-primary`. The dot turns `--color-warning` only when it is
  outside in the unwelcome direction. The line under it always says it in
  words: "Your range 49–55 bpm · in range" or "↑ above your range".
- **Step goal.** When COROS supplies one, steps show a progress bar toward it
  instead of the range bar: "Goal 8,000, set in COROS · 1,688 to go". A past day
  says "met" (with a check, in `--color-success`) or "82% of goal".
- **Watch and self-report never merge.** Sleep shows the watch's figure. When
  your check-in differs by half an hour or more it adds "you said 7½ h", and
  when the watch has nothing your check-in stands in, labelled.
- **Anything owned by Thrive or Hive opens there.** Rows are whole-row buttons
  with an out-arrow. The day has two creation actions: "Plan" opens Thrive's
  planner, and "Add" opens Hive's create screen, both with the date filled in.

## Charts

- **One axis per chart.** A group is small multiples on one shared date axis,
  never a second y-scale.
- **Marks.** Each day is a dot in `--chart-dot`, the rolling average is a 2px
  `--color-primary` line with an end dot and its value, and your range is a band
  in `--color-band`. With the average off, the line joins each day instead and
  the dots take the primary colour. Blank days break the line.
- **Special cases.** Blood pressure is a thin bar per day from diastolic to
  systolic, with gridlines at 80 and 120. Check-in levels (energy, sleep quality)
  are dots in three rows. Training time is bars, which become weekly totals past
  120 days; they're grey as context in the Recovery group and primary in
  Activity.
- **Reading values.** One crosshair runs through every chart in the group, and
  one tooltip lists them all for that date plus the day's activities. Clicking
  (or a second tap) opens the day. Every group has a table view.
- **Controls** sit in one row above the charts and scope all of them: Range
  1W · 1M · 3M · 6M · 1Y · All, Average Off · 7d · 14d · 30d, and Table.

## Words

Write from the reader's side, in sentence case. The strings that carry rules
are settled:

- "Arrives with the next sync."
- "Tap a choice again to clear it. Blank means you didn't say — it never counts
  as OK."
- "Your range 49–55 bpm · in range"
- "Completions before Sep 20 are approximate — rebuilt from Hive's status
  changes." — the date hive#239 shipped
- "Planned · not done" — a past planned workout that never happened

## Mark

A hexagon in `--color-accent` with a white sunrise — a half sun on a horizon
with three rays. It's the suite's shape (Thrive's and Hive's marks are hexagons
too) with almanac's subject inside. It is the only place `--color-accent`
appears.
