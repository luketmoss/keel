# 485 — The visual Day screen's foundation

Part of #484, which rebuilds the Day screen on prototype A (Design canvas
`Thrive Today — visual prototype`, board "A — Chosen direction"). This note
adds what every other child of #484 draws with: metric colours, the Day card,
figure sizes and the range bar. It draws nothing new on its own beyond the
card change.

Standing documents this answers to: `ui/docs/design/suite-language.md` (tokens,
data colours, "never colour alone") and `ui/docs/design/keel-wide-rules.md`
(focus, six states, forced colours). Earlier notes kept: #397's cobalt family
for everything interactive, #404's interaction states, #405's drawn icons.

## The Day card

`.day-panel`, on the Day screen only (`.day-screen .day-panel`):

| Property | Today | After |
|---|---|---|
| Background | `--color-surface` | `--color-surface` |
| Border | 1px `--color-border` | none |
| Radius | `--radius-md` | `--radius-lg` |
| Padding | `--space-md` | `--space-md` |
| Gap between panels | `--space-md` | `--space-sm` + `--space-xs` (12) via `--day-gap` |
| Title | `--text-xs`, 600, uppercase, `--color-text-secondary` | `--text-base`, 600, sentence case, `--color-text` |

The title row gains an optional icon before the words: 18px, drawn as #405's
icons are (inline SVG, `aria-hidden`), filled or stroked in the metric's colour.
`Panel` takes it as `icon?: ComponentChildren`. The heading's accessible name is
its words only.

The border goes because the cards now sit on `--color-bg` with enough surface
contrast in dark (`#1a1a1e` on `#121212`); in light, `--color-surface` white on
`--color-bg` `#f0f2f5` is the same pairing the Activities screen's grouped
background already uses. Under `forced-colors: active` the border comes back as
`1px solid CanvasText`, because forced colours flatten both backgrounds to
`Canvas`.

Cards elsewhere (Activities, Calendar, Trends, Library) keep their border and
`--radius-md`. The scope is the `.day-screen` selector, not a change to
`.day-panel`'s base rule, so the Calendar's day summary, which shares classes,
is untouched.

## Figures

Big numbers use `--font-sans` (decided with the owner: no web font), weight 700,
`line-height: 1`. Per the suite language, a lone large number does not take
`tabular-nums`; a row of figures that sit side by side (the glance row, the
sleep legend) does.

| Token | Use |
|---|---|
| `--figure-md` | glance row's steps and calories |
| `--figure-lg` | each tile's and card's main value, the sleep total and score |
| `--figure-xl` | the recovery percentage inside the ring |

A unit after a figure ("bpm", "ms", "lb", "h", "m") is `--text-sm`, weight 400,
`--color-text-secondary`, on the same baseline.

## Metric colours

A colour per metric, for its icon and its chart marks only. They are **data
colours** in the suite language's sense: never text, never status, always
beside their word. The status colours keep their meaning: `--color-warning`
still marks "outside your range in the unwelcome direction", and no metric
colour equals a status colour in either theme.

| Metric | Drawn on |
|---|---|
| `--metric-heart` | resting HR icon and line |
| `--metric-hrv` | HRV icon and line |
| `--metric-stress` | stress icon and today's bar |
| `--metric-sleep` | sleep icon (= the REM colour) |
| `--metric-sleep-deep`, `-rem`, `-light`, `-awake` | the stage bar and its legend keys |
| `--metric-steps` | steps icon |
| `--metric-calories` | calories icon |
| `--color-primary` (existing) | training: the sets ring, load bars, recovery ring |

The stage colours run dark → light → dark → bright along the bar so that
neighbours differ in lightness, not only hue, for colour-blind readers.

## Range bar

Drawn by #491. Three layers on one scale:

| Token | Layer |
|---|---|
| `--range-track` | the full scale, a 4px rounded bar |
| `--range-band` | your range on that scale |
| `--range-marker` | the value, a 3px × 8px tick; `--color-warning` replaces it in the unwelcome zone |

## The suite rule this changes

`suite-language.md`, Layout, says "Cards are for sources, one per source". The
Day screen splits COROS's daily data into a glance row and four cards (sleep,
resting HR, HRV, stress). The amendment, appended to that bullet:

> A summary screen may give each metric its own card when the card is a chart
> carrying the metric's word and value (Thrive's Day screen, #484). Lists of
> rows still group by source.

## New tokens

In `thrive/frontend/src/global.css`; the metric colours under
`[data-theme="light"]` and `[data-theme="dark"]`, the rest in `:root`.

| Token | Light | Dark | Contrast on `--color-surface` (L / D) |
|---|---|---|---|
| `--metric-heart` | `#c2185b` | `#f47a95` | 5.87 / 6.66 |
| `--metric-hrv` | `#00796b` | `#4fd1c5` | 5.32 / 9.30 |
| `--metric-stress` | `#8a5a00` | `#e0a458` | 5.93 / 7.95 |
| `--metric-sleep-deep` | `#1e3a8a` | `#5470d0` | 10.36 / 3.80 |
| `--metric-sleep-rem` | `#7c3aed` | `#b9a3ff` | 5.70 / 8.05 |
| `--metric-sleep-light` | `#5b8def` | `#4f86f7` | 3.23 / 5.03 |
| `--metric-sleep-awake` | `#8a6d00` | `#f2c94c` | 4.92 / 10.93 |
| `--metric-sleep` | `var(--metric-sleep-rem)` | same | — |
| `--metric-steps` | `#3b7a2a` | `#8bd17c` | 5.25 / 9.51 |
| `--metric-calories` | `#b54708` | `#ff9a5c` | 5.43 / 8.29 |
| `--range-track` | `var(--color-border-light)` | same | — |
| `--range-band` | `var(--color-border)` | same | — |
| `--range-marker` | `var(--color-text)` | same | — |
| `--figure-md` | `1.75rem` | — | — |
| `--figure-lg` | `2.25rem` | — | — |
| `--figure-xl` | `2.75rem` | — | — |
| `--day-gap` | `0.75rem` | — | — |

Neighbouring stage colours, in bar order, measure deep/REM 1.82, REM/light 1.76,
light/awake 1.52 in light, and 2.12, 1.60, 2.17 in dark (WCAG relative
luminance; the criterion is at least 1.4). Contrasts measured with the WCAG
formula against `#ffffff` and `#1a1a1e`.

## States

This issue changes how cards look, not what they hold: every existing state
(loading, error with Try again, note, rows) renders inside the new card
unchanged.
