# 590 — Unwind on the Day view and in Trends

Adds Unwind as a fourth Drinks kind (epic #586), counted in mg. One tap logs 5 mg.
Storage, optimistic adds, rollback, today-only adds, Edit time and Delete all work
as #520 set them up, the tile anatomy is #551's, and the Coffee tile (#560,
`560-day-coffee-tile.md`) is the template. This note covers only what changes:
the slot's layout, the Unwind tile, the log, and Trends.

**Unwind is an alias, and the alias is the whole name.** No string, token,
identifier, comment, test name or commit in this work says anything more
specific than "Unwind" and "mg".

## The slot becomes a 2 × 2 grid

#560 put Water across the full width because three tiles didn't fit on one row.
With four tiles, each one gets a half-width cell:

```
┌ (drop) Water      › ┐ ┌ (cup) Coffee      › ┐
│ 12 oz  of 64        │ │ 2 cups              │
│ [███░░░░░░░░░░░]    │ │                     │
│ ▁ ▃ ▅ ▂ ▆ ▄ █       │ │ ▁ ▃ ▂ ▃ ▂ ▁ ▂       │
│ [ + 4 oz ]          │ │ [ + 1 ]             │
└─────────────────────┘ └─────────────────────┘
┌ (glass) Alcohol   › ┐ ┌ (moon) Unwind     › ┐
│ 1 drink             │ │ 10 mg               │
│ ▁ ▁ ▂ ▁ ▃ ▁ ▂       │ │ ▁ ▂ ▁ ▁ ▂ ▁ ▂       │
│ [ + 1 ]             │ │ [ + 5 mg ]          │
└─────────────────────┘ └─────────────────────┘
  Today's log · 6 drinks                     ⌄
```

- `.drink-tile-water` loses `grid-column: 1 / -1`, and Water becomes a half-width
  tile again, as it was in #551. Its figure, goal, progress bar, seven bars and
  "+ 4 oz" don't change. They had the same 142px inside width before #560.
- The order follows the day: **Water, Coffee** on the first row, **Alcohol,
  Unwind** on the second. Unwind sits bottom-right, the last cell, and looks no
  more prominent than its neighbours.
- Tiles in a row stretch to the same height, and their buttons sit on one line
  (#551's rule).

**Why not keep Water full width and add a third row?** A lone Unwind tile on its
own row would be the most prominent thing in the slot, which is the opposite of
what an alias wants. It would also make the slot taller. The 2 × 2 grid matches
the vitals tiles below it.

### Measured

In demo mode at a 375px viewport (2026-10-23), with the 2 × 2 grid mocked in the
running app by removing Water's span and adding a fourth tile:

| Measure | Today (#560) | 2 × 2 |
|---|---|---|
| `.drinks-grid` | 343 × 352px | 343 × 352px |
| Collapsed `.drinks` slot | 370px | **370px** |
| Water tile | 343 × 176px | 166 × 176px |
| Coffee / Alcohol / Unwind tile | 166 × 164px | 166 × 176 (row 1), 166 × 164 (row 2) |
| Water's "+ 4 oz" button | — | 74 × 36px |
| Water tile content overflowing | — | none |

The slot keeps the same height with one more tile: the first row is Water's
176px either way, and Coffee stretches to match it.

## The Unwind tile

#560's Coffee tile, with these values:

| Part | Unwind |
|---|---|
| Icon | `MoonIcon`, a crescent in the house style (#405), drawn in `drinks-cards.tsx` next to the drop, glass and cup: `<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />` |
| Colour | `--metric-unwind` (new, below) for the icon, the bars and the button border |
| Title | "Unwind" |
| Figure | `--figure-lg` number, then "mg" in the unit style: "0 mg", "5 mg", "10 mg" |
| Bar toward a goal | none (no goal) |
| Last 7 days | mg ÷ 20, capped at full (`UNWIND_FULL` = 20, beside `COFFEE_FULL`). #551's empty-slot and zero-bar rules apply |
| Week `aria-label` | "Unwind, last 7 days: 5, 10, 0, no data, 5, 0, 10 mg" |
| Add button | "+ 5 mg", `aria-label` "Add 5 mg of Unwind", today only |
| Card link name | "Unwind 10 mg. Open Intake trends" |
| Screen-reader status | "Unwind 10 mg" |

Each tap is one entry of 5 mg. Two quick taps make two entries and add 10 mg.
Each tap updates the figure at once and is sent on its own, as with coffee.

## The log

Unwind entries join the list, newest first, with the moon icon in
`--metric-unwind`. The amount reads "5 mg". Edit time and Delete work as they do
for the other kinds. The delete confirm's detail line is "22:10 · 5 mg".

The row's count includes Unwind: "Today's log · 6 drinks". "Drinks" stays the
word, for the same reason #560 gave, and a mixed word would draw attention.

## States

As #560, for four tiles:

| Case | Shows |
|---|---|
| Loading | all four tiles show "—", every button disabled, no log row |
| Read failed | one error panel across the slot titled "Drinks", with Try again |
| Pending add | the Unwind figure, today's bar and the log count include the 5 mg at once |
| Log failed | rolled back, with the inline error under the Unwind tile |
| Past day | no add buttons; Unwind shows "0 mg" when none was logged |
| Future day | the slot does not mount |

## Trends

Intake becomes **Water, Coffee, Alcohol, Unwind**, the Day view's reading order.
Unwind is `UNWIND` in `components/trends/metrics.ts`, built like `COFFEE`:

- `id` `unwind`, `label` "Unwind", `unit` "mg", bars, zero-based, no reference
  line
- `points` from `intakePoints('unwind', n => n)`. Every day from the first entry
  of any kind is a point, as for the others.
- `emptyText` "No drinks logged yet.", like the others
- Its bar colour comes from `--metric-unwind`
- It appears in the Custom picker, as the other intake metrics do

## Demo data

`state/drinks.ts`'s demo day gains one Unwind entry (21:30, `app`, 5 mg). Its
history gains 0 to 2 entries on most evenings, so the bars and the chart have
something to draw.

## New tokens

| Token | Light | Dark | For |
|---|---|---|---|
| `--metric-unwind` | `#5e7c62` | `#9cbf9f` | Unwind's icon, bars and button border. A muted sage, greyer than `--metric-steps` (`#3b7a2a` / `#8bd17c`) and clear of `--metric-hrv`'s teal. It goes on `metric-contrast.test.ts`'s list. Computed: 4.6:1 on white, and 7.7:1 or more on the dark surfaces in use, both above the 3:1 floor |
