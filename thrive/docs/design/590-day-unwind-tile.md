# 590 — Unwind on the Day view and in Trends

Adds Unwind as a fourth Drinks kind (epic #586), counted in mg. One tap logs 5 mg.
Storage, optimistic adds, rollback, today-only adds, Edit time and Delete all work
as #520 set them up, the tile anatomy is #551's, and the Coffee tile (#560,
`560-day-coffee-tile.md`) is the template. This note covers only what changes:
the slot's layout, the Unwind tile, the log, and Trends.

**Unwind is an alias, and the alias is the whole name.** No string, token,
identifier, comment, test name or commit in this work says anything more
specific than "Unwind" and "mg".

## The slot: Water across the top, three tiles under it

Water stays the slot's lead tile, full width, as #560 made it. Coffee, Alcohol
and Unwind share the second row, three across. The owner chose this on
2026-10-23 over a 2 × 2 grid because Water should be more prominent than the
others, and because three matching tiles under Water make Unwind just one of a
set.

```
┌ (drop) Water                                 › ┐
│ 12 oz  of 64                                   │
│ [████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]   │
│ ▁   ▃   ▅   ▂   ▆   ▄   █                      │
│ [ + 4 oz ]                                     │
└────────────────────────────────────────────────┘
┌ (cup) Coffee ┐ ┌ (glass) Alcohol┐ ┌ (moon) Unwind┐
│ 2 cups       │ │ 1 drink        │ │ 10 mg        │
│ ▁▃▂▃▂▁▂      │ │ ▁▁▂▁▃▁▂        │ │ ▁▂▁▁▂▁▂      │
│ [ + 1 ]      │ │ [ + 1 ]        │ │ [ + 5 mg ]   │
└──────────────┘ └────────────────┘ └──────────────┘
  Today's log · 6 drinks                     ⌄
```

- `.drinks-grid` becomes three columns (`repeat(3, minmax(0, 1fr))`) with the
  same `--day-gap`. `.drink-tile-water` keeps `grid-column: 1 / -1`, and nothing
  else about Water changes.
- Order follows the day: **Coffee, Alcohol, Unwind**, left to right. Unwind is
  last, and it looks no different from the two tiles beside it.
- The three small tiles stretch to the same height, with their buttons on one
  line (#551's rule).

### Making the small tiles fit

#560 measured that three tiles across didn't fit with the tile as it was: the
title row with its chevron needs about 96px, and a third-width tile has 82px
inside its padding. Two changes, made only to the three small tiles
(`.drink-tile:not(.drink-tile-water)`), make it fit:

- **No chevron.** The whole tile is still the link to Intake trends, with the
  same accessible name, so nothing is lost but the glyph. Water keeps its
  chevron.
- **Tighter padding.** The tile's `.day-panel` padding is `--space-sm` instead
  of `calc(--space-md − --space-xs)`. The add button's inline padding is
  `--space-sm`.

The title, figure, seven bars and button are otherwise #551's anatomy.

### Measured

In demo mode at a 375px viewport (2026-10-23), with this layout mocked in the
running app (three columns, `--day-gap`, no chevrons and `--space-sm` padding on
the small tiles, plus a fourth Unwind tile):

| Measure | Today (#560) | This layout |
|---|---|---|
| Collapsed `.drinks` slot | 370px | **359px** |
| Water tile | 343 × 176px | 343 × 176px (unchanged) |
| Coffee / Alcohol / Unwind tile | 166 × 164px | 106 × 153px, **90px inside** |
| Widest title row ("Unwind" with its icon) | — | 75px |
| Widest add button ("+ 5 mg") | — | 68px |
| Content overflowing any tile | — | none |

The slot gets 11px shorter even with a fourth tile, because the small tiles are
shorter than the half-width ones.

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

An Unwind entry's tools are **Edit time · Delete**, on any day, like coffee and
alcohol. Its amount is always 5 mg, so it never gets #588's Edit amount, which
stays water only.

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
| Past day | "+ 5 mg" as the other tiles show theirs (#588): a tap files 5 mg under the viewed date at 23:59 Denver, with the accessible name "Add 5 mg of Unwind to Thu, Oct 22". Unwind shows "0 mg" when none was logged |
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
