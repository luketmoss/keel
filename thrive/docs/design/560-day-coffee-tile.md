# 560 — Coffee on the Day view and in Trends

Adds coffee as a third drink, counted in cups the way alcohol is counted in
drinks (epic #558). Everything about storage, optimistic adds, rollback,
today-only adds, Edit time and Delete is #520's, and the tile anatomy is
#551's (`551-day-drinks-tiles.md`). This note covers only what changes: the
slot's layout, the Coffee tile, the log, and Trends.

## Three tiles don't fit across one row

Measured in demo mode at a 375px viewport (2026-10-21):

| Measure | Value |
|---|---|
| `.drinks-grid` width, gap | 343px, `--day-gap` 12px |
| Today's half-width tile | 166px; 142px inside its 12px padding |
| A third-width tile would be | (343 − 2 × 12) ÷ 3 = 106px; **82px inside** |
| Alcohol's title row (icon + "Alcohol") | 74px, before the 16px chevron and its gap |
| A three-digit water figure ("128 oz") at `--figure-lg` | 81px |

With three tiles across, the title row (about 96px with the chevron) overflows
its 82px inside width. A three-digit water figure would leave 1px to spare, and
the seven bars would shrink to slivers. Shrinking the figure or dropping the
icon or chevron would break #491's tile anatomy for one slot only. So the slot
becomes **two rows**.

## The slot

```
┌ (drop) Water                                 › ┐
│ 12 oz  of 64                                   │
│ [████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]   │
│ ▁   ▃   ▅   ▂   ▆   ▄   █                      │
│ [ + 4 oz ]                                     │
└────────────────────────────────────────────────┘
┌ (cup) Coffee      › ┐ ┌ (glass) Alcohol   › ┐
│ 2 cups              │ │ 1 drink             │
│ ▁ ▃ ▂ ▃ ▂ ▁ ▂       │ │ ▁ ▁ ▂ ▁ ▃ ▁ ▂       │
│ [ + 1 ]             │ │ [ + 1 ]             │
└─────────────────────┘ └─────────────────────┘
  Today's log · 5 drinks                     ⌄
```

- **Water spans both columns** (`grid-column: 1 / -1`) in the first row. Water
  is the one drink with a goal, and its bar and goal line get the room they
  need. Nothing else about the Water tile changes; its seven bars spread
  across the full width.
- **Coffee and Alcohol** share the second row: Coffee on the left (the day's
  first drink, in the morning), Alcohol on the right. Both tiles stretch to the
  same height, and their buttons sit on one line, as #551 specifies for its
  pair.
- The log row stays under the grid, unchanged.

The slot grows by one tile row. #551's criterion that the collapsed slot be no
taller than the vitals row plus one line no longer holds, and #560 replaces it
(see Height below).

## The Coffee tile

#551's alcohol tile with these values:

| Part | Coffee |
|---|---|
| Icon | a cup with a handle and two lines of steam, in the house style (#405), drawn in `drinks-cards.tsx` next to the drop and glass icons |
| Colour | `--metric-coffee` (new, below) for the icon, the bars and the button |
| Title | "Coffee" |
| Figure | `--figure-lg` count, then "cup" / "cups" in the unit style: "1 cup", "2 cups", "0 cups" |
| Bar toward a goal | none (no goal) |
| Last 7 days | cups ÷ 4, capped at full (`COFFEE_FULL` = 4, like `ALCOHOL_FULL`); #551's empty-slot and zero-bar rules |
| Week `aria-label` | "Coffee, last 7 days: 1, 2, 2, no data, 3, 1, 2 cups" |
| Add button | "+ 1", `aria-label` "Add one cup of coffee"; today only |
| Card link name | "Coffee 2 cups. Open Intake trends" |
| Screen-reader status | "Coffee 2 cups" ("1 cup") |

## The log

Coffee entries join the existing list, newest first, with the cup icon in
`--metric-coffee`. The amount reads "1 cup". Edit time and Delete behave as
they do for water and alcohol. The delete confirm (`deleteDrinkCopy`) keeps
its title, "Delete this drink?", and its detail line names the entry by the
same amount text the list uses ("1 cup").

The row's count includes coffee: "Today's log · 5 drinks". A cup of coffee is
a drink, and splitting the count by kind would make the row longer than the
tiles above it already say.

## States

As #551, for three tiles:

| Case | Shows |
|---|---|
| Loading | all three tiles show "—", with every button disabled and no log row |
| Read failed | one error panel across the slot, titled **"Drinks"** (was "Water and alcohol"), with Try again |
| Pending add | the Coffee figure and the log count include the cup at once |
| Log failed | rolled back, with the inline error under the Coffee tile |
| Past day | no add buttons; Coffee shows "0 cups" when none were logged |
| Future day | the slot does not mount |

## Trends

Intake becomes **Water, Coffee, Alcohol**, the Day view's order. Coffee is
`COFFEE` in `components/trends/metrics.ts`, built like `ALCOHOL`:

- `id` `coffee`, `label` "Coffee", `unit` "cups", bars, zero-based, no
  reference line
- `points` from `intakePoints('coffee', n => n)`. `IntakeKind` becomes
  `DrinkKind`, so the history rule is unchanged: every day from the first
  drink of any kind is a point.
- `emptyText` "No drinks logged yet.", as the other two have
- Its bar colour comes from `--metric-coffee` (`trend-chart.tsx` reads the token
  named by the metric's id)

Coffee also appears in the Custom picker, as the other intake metrics do.

## Demo data

`state/drinks.ts`'s demo day gains two coffees (07:10 and 10:30, `app`). Its
history gains about one or two a day, so the tile's bars and the Trends chart
have something to draw.

## Height

The collapsed slot at 375px is the Water tile, plus `--day-gap`, plus the
Coffee and Alcohol row, plus the log row. The tiles' heights are unchanged by
this issue. Measured today, the half-width tile is 176px and the slot (two
tiles plus the log row) is 194px, so the new slot should be about
194 + 12 + 176 = **382px**. A full-width Water tile has the same contents and is
not expected to be taller. `/develop` records the real figure in the PR.

## New tokens

| Token | Light | Dark | For |
|---|---|---|---|
| `--metric-coffee` | `#6f4e37` | `#c9a27e` | Coffee's icon, bars and button. A roast brown, kept apart from `--metric-alcohol`'s amber and the status colours. It is added to `metric-contrast.test.ts`'s list, so it is held to 3:1 on the card in both themes, the same as the rest. |
