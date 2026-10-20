# 526 — Activity type colours as tokens, and demo data for #525

Part of #525. Nothing is drawn differently. This note names the colours the
other children draw with, and lists what demo mode must hold so each child can
be seen and tested.

Standing documents this answers to: `ui/docs/design/suite-language.md` (data
colours always carry their word) and `ui/docs/design/keel-wide-rules.md`
(contrast).

## Type colours

A colour per activity type, for its icon, its share of the month split bar
(#527), its figure (#529) and its icon tile (#528, #531). They are **data
colours**: never text on their own, always beside the type's word or icon.

The values are exactly the text colours of today's `.badge-<type>` rules, so
nothing on screen changes. The badge rules then read `color: var(--type-<type>)`
and keep their own tint backgrounds.

| Token | Light | Dark | On `--color-surface` (L / D) | On `--color-surface-raised` (D) |
|---|---|---|---|---|
| `--type-weight` | `#c53030` | `#fca5a5` | 5.47 / 9.14 | 8.05 |
| `--type-stretch` | `#2e7d32` | `#86efac` | 5.13 / 12.36 | 10.89 |
| `--type-bike` | `#1565c0` | `#93c5fd` | 5.75 / 9.62 | 8.48 |
| `--type-hike` | `#5d4037` | `#d7ccc8` | 9.32 / 11.04 | 9.72 |
| `--type-run` | `#9d174d` | `#f5a8d3` | 7.88 / 9.44 | 8.31 |
| `--type-walk` | `#10605a` | `#7fded3` | 7.39 / 10.98 | 9.67 |

Measured with the WCAG relative-luminance formula against `#ffffff`, `#1a1a1e`
and `#252528`. Light on `--color-bg` (`#f0f2f5`), the tightest is
`--type-stretch` at 4.57. Every value passes 3:1 as a graphic and 4.5:1 as text
everywhere it is drawn.

Run and walk keep #129's reasoning: they were picked to stay distinct from bike
under deuteranopia and protanopia.

## Effort colours

#528's stats line and #533's set tiles and effort bar draw effort without the
pill, so the effort colours become tokens the same way. The values are today's
`.workout-effort-*` text colours, and those rules then read them.

| Token | Light | Dark | On `--color-surface` (L / D) |
|---|---|---|---|
| `--effort-easy` | `#2e7d32` | `#86efac` | 5.13 / 12.36 |
| `--effort-medium` | `#a05d00` | `#ffb74d` | 5.17 / 10.02 |
| `--effort-hard` | `#c62828` | `#ef9a9a` | 5.62 / 8.06 |

## The tinted tile

#528 and #531 draw a type's icon on a tile tinted with its colour. The tint is
`color-mix(in srgb, var(--type-<type>) 14%, transparent)`, not a new token.
That is the same 14% the prototype used, and `color-mix` rather than opacity,
because `interaction-states.test.ts` forbids dimming with opacity (see #489's
Results).

## Demo data

Added to `src/api/demo-data.ts` and `src/api/demo-track.ts`. Every value is
invented. The dates are relative to the demo's "today", as the existing demo
rows are.

| Case | Row |
|---|---|
| Three months of history | completed rows spread over the current month and the two before it, at least 4 per month |
| Tracked hike | the existing demo hike ("Ridge Trail") and its `demo-track` loop, unchanged |
| Tracked bike | a second bundled track, `demo-track-ride`: a point-to-point line of about 12 km with a 300 m climb, built from a formula like the loop. It has `ele` on every point except a run of 5 nulls in the middle, to exercise #532's gap |
| Untracked bike | distance, ascent, heart rate, duration, no `track_ref` |
| Bare walk | duration only: no distance, no track |
| Muscle tags | weight workouts whose non-warm-up exercises carry, between them, Chest, Back, Shoulders, Arms, Legs and Core; one whose exercises carry only Push, Pull and equipment tags |
| Warm-up only tag | one weight workout where Back appears only on a warm-up exercise |
| Stretch | one with a note and Easy effort, one with neither |
| Planned | three or more after today, one dated today, one overdue |

## States

None new. Outside demo mode nothing changes.
