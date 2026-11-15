# 915 — Forage Trends: the Meals tab

Specifies [#915](https://github.com/luketmoss/keel/issues/915), part of epic
[#889](https://github.com/luketmoss/keel/issues/889). It builds on [`913-trends-screen.md`](913-trends-screen.md), which
owns the route, the controls, **§The chart**, **§The readout**, **§Choosing a day**, **§Today is drawn, and is not
counted**, **§States** and **§Data**, and on [`914-trends-macros-nutrients.md`](914-trends-macros-nutrients.md), which owns
the tab row (`role="tablist"`); this note cites them by name and does not restate them. The layout reference is the
prototype's Meals tab ([`889-trends-prototype.html`](889-trends-prototype.html), the "Meals and foods" scene); its
numbers are example data. The per-meal totals are [`712-food-log.md`](712-food-log.md) §Per meal (`by_meal`, #865). Tokens,
spacing and "blank is not zero" are [`suite-language.md`](../../../ui/docs/design/suite-language.md) (standing); shares are
rounded as #864 does (largest remainder, `<1%`).

**What this adds:** a fourth tab, `Energy · Macros · Nutrients · Meals`, with two cards. It reads
`getFoodLogTotals(from, to, byMeal: true)` over #913's range. **Meals needs the `by_meal` read; the other tabs do not.** The
screen therefore fetches with `byMeal: true` once any built tab needs it, so all tabs share one call and a tab switch
never refetches (a day's own figures are the same with or without `meals`). No API change.

## What a meal's figures are

A **meal-day** is one slot on one counted day (#913: days through yesterday) with calories, that is, a `meals` entry of
that day whose `kcal` is not null. A slot entry with entries but no calories is not a meal-day, and a counted day is a
day with calories. From these:

- `C`: the number of counted days.
- For a slot `s`: `N_s` meal-days, and `total_s`, the sum of its `kcal` over them.
- **Average on the days eaten:** `total_s / N_s`, to the whole number. This is the number the owner wanted
  (`After dinner, 310 kcal on 14 of 27 days`): an average over the days the meal happened, so an occasional snack is not
  watered down by the days it was skipped.
- **Share of all calories:** `total_s` over the sum of `total` across slots, **not** the day figure, so the shares fill the
  bar and add to 100 (whole numbers, largest remainder, `<1% of all` for a real value that rounds to 0, as #864).
- **Low:** a meal-day whose meal `partial` is true counts as it is (its calories are what was counted). The card says how many:
  `Includes 4 meals with low totals (some items have no nutrition).`, shown only when above 0. Never silently dropped.

Slots are in `SLOTS` order: Breakfast, Lunch, Dinner, After dinner, Snacks. **A slot from before a rename** (data under a name
that is not in `SLOTS`) follows the five, in the order the API returned it (first seen), under the name it was stored with,
so no calorie goes missing from the shares. It is drawn in `--color-text-muted` and is not a legend gap.

## A typical day, by meal

Heading `A typical day, by meal`, the range in words (#913's phrases) beside it.

- **A split bar** of the slots by share of all calories, left to right in slot order, each slot's colour (below), at least
  `--space-xs` wide so a real value is never invisible (the others give up that width), as #864's bar. The bar's accessible
  name is `Calories by meal: Breakfast 14%, Lunch 22%, ...`, and it carries no meaning alone: every figure is also text.
- **A row per slot**, the five known slots always, then any renamed slot present:
  - a swatch in the slot's colour and the name;
  - under the name, in `--text-xs` `--color-text-secondary`, `14 of 27 days` (`N_s of C`, whole numbers);
  - right: `310 kcal` in `--text-base` weight 600, tabular, and under it `11% of all`.
  The row is not a button (no drill-down here). Its accessible name is one sentence: `After dinner, 310 kcal on 14 of 27 days,
  11% of all calories`.
- A slot that was never eaten in the range shows `0 of 27 days`, `—` for the kcal (never `0 kcal`: it isn't an average of
  anything) and `0% of all`, and has no segment in the bar.
- Under the rows, `--text-sm` `--color-text-secondary`: `kcal is the average on the days that meal was eaten.` and, when it
  applies, the low-totals line above.
- **No counted day** (nothing logged in the range, or only today, or only unknown entries): an empty bar (one track segment,
  so the card keeps its height), the five slots with `—` in place of every figure and no
  day count or share line, and `No days logged in this range.` Never 0.

### What the figures never say

No comparison between meals, no "dinner carries the day" sentence, no arrows and no judging colour: the shares are shown and
the reader concludes (#889: the apps show the data).

## Each day, by meal

Heading `Each day, by meal`. This is **#913's chart** with these differences only:

- **Stacked bars.** A day's bar is its meals stacked from the baseline in slot order (Breakfast at the bottom), each segment
  the meal's kcal in the slot's colour. A segment is separated from the next by a hairline in `--color-surface` so adjacent
  colours are never the only boundary. The y axis is zero-based to the largest day, with kcal.
- **A day's total is what the stack shows:** the sum of its counted meals' kcal, which can differ from the day figure by 0.1 and
  from nothing visible.
- **Gaps** are #913's: a day with nothing logged, or with entries but no calories, is the dashed mark on the baseline, never a
  zero-height bar.
- **A low meal** (its `partial` true) has its segment **hatched** in its slot colour, as Energy hatches a low day, and the
  readout says `Low` after it.
- **No average line**, and the Average control has no effect here: it is disabled on this tab with `No average line on this
  chart` under the controls (the same disabled form #913 uses for weekly bars). The range control applies.
- **Today** is drawn (stacked, from what is logged) but, as #913 says, is "so far" in its readout and is not in the typical-day
  card above.
- **Weekly bars past 182 days** (#913's rule): a week is one stacked bar of the mean kcal a day per slot over that week's counted
  days (each slot's sum over the week divided by the week's counted days, so the stack equals the week's mean day), a gap when
  the week has none, hatched per segment as above. Its readout reads `Week of Nov 2 · Breakfast 410 · ... · 5 of 7 days logged`
  and offers no day link.
- **Legend** under the chart: each slot's swatch and name (`Breakfast`, `Lunch`, `Dinner`, `After dinner`, `Snacks`, and a
  renamed slot's name when present), `Not logged`, `Low` (hatched). A slot with no segment in the range is left out.
- **The y axis ticks and gridlines** are #913's `--chart-grid`, with a fixed left padding so this chart's x positions match the
  other tabs'.

### Reading a day

Selecting a day (pointer or keyboard, #913 §Choosing a day) reads **each meal's kcal** and links to that day:

| Selected | Reads |
|---|---|
| A day with meals | `Fri, Nov 6 · Breakfast 410 · Lunch 620 · Dinner 880 · After dinner 310 · Snacks 140 kcal`, then **Open day ›** |
| A meal that is low | its figure, then `Low` (`Dinner 880 Low`), as a chip |
| A meal with entries but no calories | `Dinner no nutrition`, in place of a figure (never `0`) |
| A slot not eaten that day | left out of the line |
| Today | `Today · Breakfast 410 · Lunch 620 kcal so far`, then **Open day ›** |
| Entries but no calories at all | `Fri, Nov 6 · logged, but nothing has nutrition yet`, **Open day ›** |
| Nothing logged | `Fri, Nov 6 · nothing logged`, **Log this day ›** |

- The link is #913's: a real link to `#/eaten/<date>` (`#/eaten` for today), a 44px target, accessibly named
  `Open day, Friday, November 6`. Back returns to Trends on this tab and range, as #913's hash rules say.
- **The readout cell reserves three lines.** The longest readout (a date and all five slots at four-digit kcal, with the link)
  measured **668px** of text at `--text-sm` against a card whose content is about 311px wide at a 375px viewport: three lines.
  Reserving them is what keeps a selection from moving the card, as #913 requires. A shorter readout leaves the space.
- The `role="status"` region announces `Friday, November 6: Breakfast 410, Lunch 620, ...` only for keyboard moves.

## The tab row at four and five tabs

The tab row stays one row: its tabs share it equally with `--space-xs` of padding each side. **Measured** (375px viewport,
`--text-sm`, weight 600, canvas text width): the labels are Energy 43.5, Macros 46.3, Nutrients 59.5, Meals 37.4 and Foods
38.2px. Five tabs on a 343px row are about 68px each, so the widest label (59.5px plus 8px of padding) fits with 0.5px to
spare, and four tabs have room. If a label does not fit (larger system text), the row scrolls sideways rather than wrapping or
clipping a label, the selected tab scrolled into view, and every tab keeps its 44px target. #916's fifth tab is the one that
brings the row to this width.

## New tokens

The suite has no data colour for a meal slot, and the macro colours mean protein, carbs and fat in the app. These are
Forage's own (in `global.css`, with its other data colours), one per slot, chosen to be told apart by hue **and** by position
and word (the legend and rows carry every name), with the renamed slot in `--color-text-muted`.

| Token | Light | Dark | For |
|---|---|---|---|
| `--color-slot-breakfast` | `#c2410c` | `#fb923c` | Breakfast's bar segments, swatch and bar slice |
| `--color-slot-lunch` | `#0f766e` | `#2dd4bf` | Lunch's |
| `--color-slot-dinner` | `#4338ca` | `#818cf8` | Dinner's |
| `--color-slot-after-dinner` | `#be185d` | `#f472b6` | After dinner's |
| `--color-slot-snacks` | `#64748b` | `#94a3b8` | Snacks' |

**Contrast against `--color-surface`** (`#ffffff` light, `#1a1a1e` dark; computed from the values, each over the 3:1 a graphic
needs): light 5.18, 5.47, 7.90, 6.04, 4.76; dark 7.67, 9.32, 5.82, 6.55, 6.77. On `--color-surface-raised` in dark (`#252528`):
6.75, 8.21, 5.12, 5.77, 5.96. **Whether the five read as five on a phone is a judgment for the owner's eyes**, not something a
ratio settles; indigo is near the protein blue, which is why the two are never on one tab.

## States

As #913 §States and #914's table, for this tab: loading shows skeleton cards with the tab row and controls usable; nothing
logged in the range shows the empty bar, `—` and `No days logged in this range.` and an each-day chart of gaps; nothing
logged at all is #913's `Nothing logged yet.` card; failed is `Couldn't load your log.` and **Try again**.

## Copy

| Where | Text |
|---|---|
| Tab | `Meals` |
| Typical-day card | `A typical day, by meal`, `14 of 27 days`, `310 kcal`, `11% of all`, `<1% of all`, `kcal is the average on the days that meal was eaten.`, `Includes 4 meals with low totals (some items have no nutrition).`, `No days logged in this range.` |
| Each-day card | `Each day, by meal`, `No average line on this chart` |
| Readout | as the table above, `Low`, `no nutrition` |
| Legend | the slot names, `Not logged`, `Low` |

## Edge cases

- **One counted day:** each slot eaten that day has `1 of 1 days`, its kcal that day, its share; the stacked chart has one bar.
- **A slot logged only on a day with no calories** (all its entries unknown): not a meal-day; its row reads `0 of C days`.
- **A day's meals do not appear** (an API answer without `meals`): that day counts for Energy but contributes no meal-day, and
  its bar is drawn as a gap on this tab. The app asks for `byMeal`, so this is a defence, not a case.
- **A meal with more calories than the day's figure rounding allows** (0.1 differences): the stack height is the sum of its
  meals, as above; nothing is clipped.
- **A renamed slot** is a sixth row, a sixth segment colour (`--color-text-muted`) and a sixth legend entry; it is the last.
- **Midnight, rapid range changes, time zone:** as #913.

## Out of scope

- Per-food contributions to a meal (#916 is by food, over the range, not by meal).
- A target or "ideal" meal split, comparisons between meals, and any sentence that concludes.
- Planned-but-not-logged meals (Trends reads the log only).
- A table view (#913), and an average line on the stacked chart.
