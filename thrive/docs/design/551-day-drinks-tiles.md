# 551 — Water and Alcohol as tiles

Replaces the layout of #520's cards (`520-day-drinks-cards.md`); every rule
about data, rounding, the goal, optimistic adds, rollback, editing and deleting
stays as #520 specified it. Only where things sit and how big they are changes.
The tile anatomy is #491's (`491-day-metric-tiles.md`): a `section` in the #485
card style, a `--text-sm` 600 title with icon, a `--figure-lg` value.

## The slot

`drinks` stays where it is (after `sleep`, before `vitals`) and becomes a
two-column grid with `gap: --day-gap`, exactly like `vitals`: Water left,
Alcohol right. Under the grid, inside the same slot, one log row.

```
┌ (drop) Water      › ┐ ┌ (glass) Alcohol   › ┐
│ 8 oz  of 64         │ │ 1 drink             │
│ [██░░░░░░░░░░]      │ │                     │
│ [ + 4 oz ]          │ │ [ + 1 ]             │
└─────────────────────┘ └─────────────────────┘
  Today's log · 3 drinks                     ⌄
```

## A tile

1. **Title row**: icon (`--metric-water` / `--metric-alcohol`) and "Water" /
   "Alcohol", `--text-sm` 600; at the right the `CardChevron`. The title is a
   `CardLink` to Trends' **Intake** group (#521) for the viewed date, as the
   metric tiles link to theirs (#504).
2. **Value**: `--figure-lg`, then the unit ("oz", "drink"/"drinks") and, for
   water, "of 64" in `--text-sm` `--color-text-secondary`. The goal's unit is
   dropped because it is beside the value's.
3. **Bar** (water only): `--drink-bar-height` is reduced to 6px, matching the
   widget and the metric tiles' range bar weight; full tile width.
4. **Add button** (today only): `.btn .btn-sm` in the metric colour, label
   "+ 4 oz" / "+ 1", left-aligned, width to its label. `.btn-sm` is the app's
   compact button (36px tall); a transparent `::before` extends its hit area to
   the 44px minimum without changing how it looks. On a past day the button is
   not drawn and the tile simply ends after the value (bar for water).
5. The two tiles stretch to the same height (grid `align-items: stretch`), and
   the buttons sit at the bottom of each tile, so they share a baseline even
   though only Water has a bar.

## The log row

A full-width `button` styled as a quiet row (`--text-sm`,
`--color-text-secondary`, no card background), `aria-expanded`:

- Collapsed (the default, on every load): "Today's log · 3 drinks" (past day:
  "Fri's log · 3 drinks"), a down chevron at the right. Zero entries: "Nothing
  logged yet." and no chevron; it is not a button then.
- Expanded: the chevron turns up and #520's entry list appears below it,
  unchanged (water and alcohol together, newest first, each with its kind's
  icon, time, amount and ⋯ for Edit time / Delete).
- The open state is not remembered across days or reloads.

## States

| Case | Shows |
|---|---|
| Loading | both tiles with "—" as the value, buttons disabled, log row hidden |
| Read failed | one `PanelStatus` error with "Try again" spanning the grid, as `vitals` does |
| Over goal | bar full, value continues ("72 oz of 64") |
| Pending add | the value already counts it; the log row count includes it |
| Log failed | as #520: rolled back, inline error under the tile that was tapped |
| Future day | not mounted |

## Width

At 375px each tile is about 160px wide: "72 oz" plus "of 64" fits on one line
at `--figure-lg`; a value of three digits wraps "of 64" under it rather than
shrinking the figure.

## New tokens

None. `--drink-bar-height` (from #520) changes from 12px to 6px.
