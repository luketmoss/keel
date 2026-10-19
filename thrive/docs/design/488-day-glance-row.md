# 488 — The glance row: steps, recovery, calories

Part of #484; uses #485's tokens. A new slot, `glance`, between the week strip
and the Training card. It reads the viewed day's DailyHealth row from the
`dailyHealth` signal the screen already loads; it makes no read of its own.

## Layout

Not a card: it sits on `--color-bg`, so the eye lands on it first. Three
columns, `1fr auto 1fr`, centred, margin-top `--space-md`.

- **Left — steps.** Icon (drawn shoe prints, 22px, `--metric-steps`), the count
  at `--figure-md` with thousands separators, then a word in `--text-xs`
  `--color-text-secondary`.
- **Centre — recovery.** A 168×160 SVG: a 270° arc track (12px stroke,
  round caps, `--color-surface-raised`) opening at the bottom, and the value arc
  on top in `--color-primary`, its length `recovery / 100` of the track. Inside,
  the value at `--figure-xl` with a smaller "%" (`--text-xl`), and "recovery" in
  `--text-xs`.
- **Right — calories.** Icon (drawn flame, `--metric-calories`), the count at
  `--figure-md`, then its word.

The three numbers sit side by side, so they use `tabular-nums`.

## When each piece shows

| Viewed day | Row exists | `recovery` | Shows |
|---|---|---|---|
| today | yes | value | steps · ring · calories |
| today | yes | blank | steps · calories (two columns, centred) |
| past | yes | any | steps · calories |
| today | no | — | nothing (the vitals area's "Not synced yet today" note covers it) |
| past | no | — | nothing ("No watch data for this day." covers it) |
| future | — | — | not mounted |

Recovery is a current-state snapshot that COROS writes only on the days a sync
ran, so on a past day it says "how ready were you when that sync ran", not "how
did that day go". The owner chose to show it on today only (2026-10-19).

A recovery value outside 0–100 is clamped for the arc and printed as stored.

## Words

| Value | Today | Past |
|---|---|---|
| steps | "steps so far" | "steps" |
| calories | "kcal so far" | "kcal" |
| blank steps / calories | "—" over the same word | "—" over the same word |

Calories are COROS's daily figure as synced; the row does not add workouts to
it, and steps include indoor walks, as the DailyHealth column notes say.

## Accessibility

- The row is a `section` with `aria-label="Day at a glance"`.
- Each figure and its word are one text run: a screen reader hears
  "4,450 steps so far".
- The ring is `role="img"` with `aria-label="Recovery 76%"`; the printed number
  inside it is `aria-hidden` so it is not read twice.
- Under forced colours the arc track draws in `GrayText` and the value arc in
  `Highlight`.

## Loading and failure

While `dailyHealth` is not `loaded`, the row is not drawn; the vitals area's
single `PanelStatus` (#491) says loading, and Try again. There is never a ring
at 0 standing in for "not loaded".

## Removed

The Steps row in the Health list (#239's `steps` metric) is no longer drawn on
the Day screen. `HEALTH_METRICS` keeps the entry for Trends.
