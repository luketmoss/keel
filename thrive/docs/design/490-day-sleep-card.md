# 490 — The Sleep card

Part of #484; uses #485's tokens. Sleep leaves #239's Health list and gets its
own card, slot `sleep`, after `training`. Every rule about which night a day
shows stays in `health-rows.ts`: sleep is filed under the day you woke up, and
`sleep_total_s` includes awake time. A new pure `sleepView(rows, date, isToday)`
there returns what this card draws; the card only draws it.

## Layout

```
(moon) Sleep                          last night
84  sleep score                       7h 48m
[ deep ][ REM ][     light     ][aw]
10:27 PM                              6:15 AM
■ Deep    ■ REM     ■ Light   ■ Awake
1h 57m    1h 31m    3h 39m    41m
Your range 6h 38m–8h 22m · in range
```

- Title "Sleep", moon icon in `--metric-sleep`. At the right, `--text-xs`
  `--color-text-muted`: `nightOf(date, isToday)` ("last night", "Fri night").
- Row two: the score at `--figure-lg` followed by "sleep score" in `--text-xs`
  `--color-text-secondary` stacked on two lines; at the right the total at
  `--figure-lg` with "h" and "m" as units (`hoursMinutes` split).
- The stage bar: 12px tall, `--radius-sm` ends, segments in the order deep,
  REM, light, awake, separated by 2px gaps, each segment's `flex-grow` its
  seconds. Colours `--metric-sleep-deep|rem|light|awake`.
- Under the bar's ends, bed and wake (`clock12`), `--text-xs`
  `--color-text-secondary`.
- Legend: four equal columns; each a 8px `--radius-sm` swatch, the stage name
  (`--text-xs` `--color-text-secondary`) and its duration (`--text-base`, 600,
  `tabular-nums`, `hoursMinutes`, "41m" under an hour).
- The range line, exactly #239's caption for sleep: "Your range 6h 38m–8h 22m ·
  in range", "↓ below your range" in `--color-warning` bold (sleep's unwelcome
  direction is below), or the building line.

## States

| Case | Shows |
|---|---|
| Row with total and all stages | everything above |
| Some stages blank | only present stages in the bar and legend; widths are shares of the present stages' sum |
| No stages | no bar, no legend; score, total, times and range remain |
| Score blank | no score and no "sleep score" words; the total moves left |
| Total blank, today | "—" and "Arrives with the next sync." |
| Total blank, past | "—" and "No sleep recorded." |
| Bed or wake blank | no time row |
| No row for the day | the card is not drawn; the vitals area's note covers the day (#491) |
| `dailyHealth` loading / failed | the card is not drawn; #491's single `PanelStatus` covers it |
| Future day | not mounted |

## Accessibility

- The bar is `role="img"`, `aria-label="Deep 1 hour 57 minutes, REM 1 hour 31
  minutes, light 3 hours 39 minutes, awake 41 minutes"`. The legend repeats it
  as text, so it is not hidden; the swatches are `aria-hidden`.
- The score reads "84 sleep score"; the total "7 hours 48 minutes" via an
  `sr-only` twin, the visual "7h 48m" `aria-hidden`.
- Forced colours: segments draw with `CanvasText` borders so their boundaries
  stay visible when the fills flatten.

## Not here

A category word for the score ("Good", "Optimal"): COROS's bands are not synced,
and inventing thresholds would put a judgement on screen nobody made. The
prototype's "Good" pill is therefore dropped.
