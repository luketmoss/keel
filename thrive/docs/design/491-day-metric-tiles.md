# 491 — Metric tiles: resting HR, HRV, stress

Part of #484; uses #485's tokens. Replaces #239's Health panel with a slot,
`vitals`, after `sleep`: a two-column grid of tiles (`gap: --day-gap`), resting
HR and HRV on the first row, stress and body (#492) on the second. Sleep (#490)
and steps (#488) have already left the list.

All comparison rules stay in `health-rows.ts` and `your-range.ts`: the range is
the mean ± 1 SD of the 30 local days before the date, at least 14 values,
decided on the displayed (rounded) numbers. A new pure
`vitalsView(rows, date, isToday)` returns each tile; the tiles only draw it.

## A tile

A `section` in the #485 card style, padding `--space-md` minus `--space-xs`
(12), `aria-labelledby` its `h2`.

```
(icon) Resting HR
57 bpm
╱╲_╱‾╲__╱╲      ← 14-day line
━━━━[████]━━|━  ← range bar
49–56 · ↑ above
```

1. **Title**: icon + label, `--text-sm` 600 `--color-text` (smaller than full
   cards' titles because tiles are half width).
2. **Value**: `--figure-lg`, unit after it. On today, stress adds "so far".
3. **Chart** (below).
4. **Range bar** (resting HR and HRV only, below).
5. **Caption**: `--text-xs` `--color-text-secondary`.

## Resting HR and HRV: the 14-day line

- The 14 days ending on the viewed day. `viewBox` 0 0 140 32, stretched to the
  tile's width, `preserveAspectRatio="none"`, stroke 2px in the metric colour
  (`--metric-heart`, `--metric-hrv`), round joins.
- y is scaled to the 14 values' own min and max, padded by 10% of their spread
  (at least 1 unit) so a flat week is not drawn as noise.
- **A blank day breaks the line** (suite rule): each run of consecutive values
  is its own polyline; a lone value between blanks is a 2.5px dot.
- The viewed day's point, when present, is a 2.5px dot at the line's end.
- `aria-hidden`: the value and caption carry the meaning.

## Resting HR and HRV: the range bar

- 8px tall: `--range-track` across the full width (4px, centred), the range as
  `--range-band` on top, and the value as a 3px × 8px `--range-marker` tick.
- Scale: from min(range lo, value) − 15% of the range's width to
  max(range hi, value) + 15%, so the band always sits mid-bar and the value is
  always on the bar. Positions use the displayed (rounded) numbers, the same
  ones the caption prints.
- In the unwelcome zone (above for resting HR, below for HRV) the marker is
  `--color-warning`; otherwise `--range-marker`.
- `aria-hidden`; the caption says it in words.

## Stress: seven bars

- The 7 days ending on the viewed day; bars 40px max, `--radius-sm` tops,
  height value / 60 (COROS's stress rarely passes 60; higher is capped to full).
- The viewed day's bar in `--metric-stress`; the others in `--metric-stress` at
  35% opacity. A blank day is an empty slot.
- `role="img"`, `aria-label="Average stress, last 7 days: 23, 27, 29, 45, 33,
  39, 31"`, "no data" for a blank.

## Captions

| Case | Caption |
|---|---|
| In range | `49–56 · in range` |
| Unwelcome side | `49–56 · ` + **`↑ above`** in `--color-warning` bold (HRV: `↓ below`) |
| Welcome side | `49–56 · ↓ below` in `--color-text-secondary` (HRV: `↑ above`) |
| Fewer than 14 values | `Building your range — 9 of 14 days so far` (no range bar) |
| Stress, today | `Last 7 days` (a day in progress gets no range, #239) |
| Stress, past | its range caption as above (unwelcome = above) |
| Value blank | `—` as the value; caption `No reading this day.` (past) / `Arrives with the next sync.` (today); the chart still draws the other days |

The arrow is `aria-hidden`; the word carries it. The bounds use the metric's
display precision and unit is dropped in the caption because it is beside the
value.

## The whole area's states

| Case | Shows |
|---|---|
| `dailyHealth` loading / error | one card titled "Health" holding `PanelStatus` ("Loading…" / "Couldn't load your health data." + Try again), in place of the tiles, the glance row and the sleep card |
| No row for the viewed day, today | one card "Health", sub "Not synced yet today", note "Last night's sleep and heart rate, and today's steps, arrive with the next sync." |
| No row, past day | one card "Health", note "No watch data for this day." |
| Future day | not mounted |

Those words are #239's, unchanged. The body tile (#492) reads its own signal and
keeps its own states beside them.

## Removed

`health-panel.tsx` and the `.health-list` row layout on the Day screen.
`HealthRow` stays exported only if Calendar's day summary still uses it
(checked during development; delete if nothing imports it).
