# 914 — Forage Trends: the Macros and Nutrients tabs

Specifies [#914](https://github.com/luketmoss/keel/issues/914), part of epic
[#889](https://github.com/luketmoss/keel/issues/889). It builds on
[`913-trends-screen.md`](913-trends-screen.md), which owns the route, the controls, **§The chart**, **§The readout**,
**§Choosing a day**, **§Today is drawn, and is not counted**, **§States** and **§Data**, and which this note cites by name
and does not restate. The layout reference is the prototype's Macros and Nutrients tabs
([`889-trends-prototype.html`](889-trends-prototype.html)); its numbers are example data. How a share, a split bar and "at
least" read is [`864-day-card-macro-bars.md`](864-day-card-macro-bars.md) (4/4/9, largest-remainder rounding, `<1%`,
`at least 20 g`) and is reused as it is: the code is `ui/macro-math.ts`. The totals' shape, `unknown` and the seven are
[`712-food-log.md`](712-food-log.md) and #755. Tokens, spacing and "blank is not zero" are
[`suite-language.md`](../../../ui/docs/design/suite-language.md) (standing).

**What this adds:** two tabs on #913's screen, so the tab row (hidden while Energy was alone) now shows
`Energy · Macros · Nutrients`. Both use `getFoodLogTotals` over the range #913 already fetched; the same range and average
controls apply and keep their choices. No API change.

## The tab row

`role="tablist"`, three tabs, 44px targets, the selected one `aria-selected="true"`, Left and Right move between them. The
panel under it is `role="tabpanel"`. Switching a tab clears any selected day and is a swap. The hash follows
(`?tab=macros`), as #913 says. The screen opens on Energy unless the hash names a tab.

## Macros

Cards, in order: **Where calories come from**, **Split by week**, **Grams per day**.

### Where calories come from

Heading `Where calories come from` with the range in words (#913's phrases) beside it.

- A **split bar** of protein, carbs and fat by calories: #864's `MacroBar`, the same segments, order (Protein, Carbs, Fat),
  colours (`--color-macro-protein`, `--color-macro-carbs`, `--color-macro-fat`) and minimum segment width.
- Three rows under it, each: a swatch, the name, the average grams a day to the whole number (`142 g`), and `31% of kcal`
  at the right. Shares are #864's: of the three macros' calories added together (not of the kcal figure, which can carry
  calories the macros do not), whole numbers adding to 100, `<1% of kcal` for a real value that would round to 0.
- **What is averaged.** Grams a day is the mean over **counted days** (#913: through yesterday) that have calories, so a
  logged-but-all-unknown day is out, a low day is in. The shares come from those means. A low day's macros are what was
  counted, as the Day card's are; the card's count line says how many days it rests on and how many are low, as Energy's:
  `24 of 29 days logged · 3 low`.
- Nothing counted in the range: an empty bar (one track segment, so the card keeps its height), the three names with `—`
  in `--color-text-muted`, no share line, and `No days logged in this range.` Never 0.

### Split by week

Heading `Split by week`, with `% of kcal` beside it.

- **100% columns**, one per week (Monday to Sunday, as #913's weekly bars), each stacked Protein, Carbs, Fat from the
  bottom, the same colours, the three shares for that week from its **counted** days' summed macros (not an average of daily
  shares, so a big day weighs what it weighs). The y axis is 0 to 100% with ticks at 0, 50 and 100; x ticks are week starts
  (`Nov 2`), as #913's x axis does.
- **A week with fewer than 3 counted days is a gap**, not a column: a split from one or two days is noise. It is drawn as the
  dashed mark on the baseline in `--chart-gap`. Decided over drawing it (a 100% column from one dinner looks as sure as
  one from seven days) and over hiding it (a hole with no mark reads as a bug); it could go the other way.
- **The card shows only when two or more weeks in the range have a column.** Otherwise it is replaced by one line in
  `--color-text-secondary`: `Split by week needs two weeks with at least 3 days logged.` (1W always reads this.) A week
  that is the range's first or last and is cut by it counts only the days inside the range.
- **Reading a week.** Tapping or moving to a column selects it (hairline across its column, the others stay), and the
  readout above the chart reads `Nov 2–8 · Protein 28% · Carbs 45% · Fat 27% · 5 days logged` (`Nov 2–8 · too few days to
  split` on a gap, with the day count). It offers no day link: a week is not a day. #913's keyboard rules apply, a step being
  a week here.
- The accessible name is `Macro split by week, last 3 months`; the summary line is its description. Each segment's value is
  in the readout, never colour alone, and the legend under the chart is the three names with their swatches.
- A range with so few days that no week qualifies is the one-line state above. A range longer than six months draws every
  week as it does here (the card was weekly already), so #913's weekly-bars switch changes nothing for this card.

### Grams per day

Heading `Grams per day`. Under it, a three-way segmented control, `Protein  Carbs  Fat`, 44px targets, one selected
(default Protein), **remembered between visits** like the range (`localStorage` `forage-trends-macro`, wrapped as #913's
are), and set by `metric=protein|carbs|fat` in the hash. The chart is **#913's chart** with the metric's grams in place of
kcal and these differences only:

- The bar colour is the macro's own token (`--color-macro-*`) in place of `--chart-bar`; the hatching, the gap mark and
  the average line are unchanged, and the legend's first mark is named for the macro (`Protein`, not `Day`).
- A day is **low** when the day's `partial` is true, as on Energy, hatched and with the `Low` chip: a low day's grams are
  what was counted. A day with entries but no calories is a gap, with the same readout words as Energy.
- The readout reads `Fri, Nov 6 · 142 g`, then the average text and chip as #913's table says, and **Open day ›** or **Log
  this day ›**. Whole numbers.
- Everything in #913 §The chart applies, including today (drawn, not counted), the average line's breaks, the zero-based axis
  with grams on it, weekly bars past 182 days (the Average control disabled, as there) and the keyboard.
- The summary line over it: `142 g a day, on average · 24 of 29 days logged`, with the macro's name in the heading; `—`
  when nothing is counted.
- Switching the macro keeps the range, the average and the selected day (the same date), because it is a different series
  over the same days.

## Nutrients

One card, `Label nutrients`, with `a day, on average` beside it, then the seven rows in **Nutrition Facts order**, the order
the food form (#875) and the day card's More nutrition use: **Saturated fat, Trans fat, Cholesterol, Sodium, Fiber,
Sugars, Added sugars**. (The prototype listed them in another order; the app's one order wins.) Under the rows, one line in
`--text-sm` `--color-text-secondary`: `Tap a nutrient for its chart. No target lines until targets are chosen.`, and, when
any row reads "at least", #864's note once: `At least: some entries don't have this one.`

### A row

A button (the whole row, 56px or more, `aria-expanded`, `aria-controls` the panel under it) with, left to right:
1. The name (`--text-base`), and under it, when the row is "at least", `at least, some entries didn't report it` in
   `--text-xs` `--color-text-secondary`.
2. A **sparkline**: bars for the range's days (weeks past 182 days, #913's rule), the height scaled to that row's own largest
   value in the range, a gap drawn as no bar (the sparkline is a decoration of the number beside it: `aria-hidden`, no
   readout, no hatching), colour `--chart-bar`. It is not zero-based per day: a day with no value has no bar, and a day
   with a measured 0 has none visible either, which is why its row also shows the figure.
3. The average, right-aligned, tabular, in `--text-base` weight 600, with the unit: `1,240 mg`, `22 g`.

### What the average is

- **Daily average of the counted days that have a value for it.** A day's value is the sum over the entries that report it
  (`null` when none does). Counted days with `null` are out of the average (a day where nothing reported sodium isn't a day
  of 0 sodium).
- **It reads "at least" when any counted day's `unknown` count for that nutrient is above 0** (some entries that day had
  calories but didn't report it, #755), including a day whose value is `null` for that reason. The value then reads
  `at least 1,240 mg` (words, not a symbol; accessible name the same), exactly as #864 words it. The wording promises only
  that the figure is what was reported.
- Whole numbers, except a gram value under 10, which shows one decimal (`0.4 g`, `8.5 g`): trans fat and saturated fat sit
  there. mg is always whole. A measured 0 reads `0 g` (trans fat is often 0) and is a value, not a gap.
- **No counted day has a value** (a nutrient nothing reported, or a range before #755's columns existed): the row shows `—`
  (accessible name "not reported") and `Not reported in this range`, an empty sparkline, and stays tappable (its chart is all
  gaps with the readout words below). Never 0.

### Opening a row's chart

Tapping a row opens its chart **in place, under the row**, and closes any other open row (one open at a time). Tapping it
again, or another row, closes it. The panel is #913's chart with this nutrient's value in place of kcal, in the same
card:
- Heading line `Sodium · mg a day`; a one-line summary `1,240 mg a day, on average · 24 of 29 days logged` (the average's
  "at least" form when it applies); the readout; the chart; the legend (`Day`, the average's window, `Not logged`).
- The chart's colour is `--chart-bar`, as it is not a macro. No hatching for Low here: a nutrient day is not made low by the
  seven (#755: none of the seven makes anything partial). Instead, a day whose `unknown` for this nutrient is above 0 has its
  bar **outlined and not filled** ("at least" in a mark, not colour alone), with `at least` in the readout and the legend
  entry `At least (some entries didn't report it)` while one is on screen.
- The readout, per #913's table with these changes: `Fri, Nov 6 · 1,820 mg` for a day with a value, `Fri, Nov 6 · at least
  1,820 mg` for an "at least" day, `Fri, Nov 6 · logged, but nothing reported this` for a day with entries and no value
  (a gap), `nothing logged` and **Log this day ›** for an absent day, and **Open day ›** on every day that has entries.
  Today reads `so far`, as #913 says.
- **`metric=<nutrient>` in the hash** opens Nutrients with that row open and scrolled into view; `metric=sodium` is the
  value. Opening a row writes it to the hash in place; closing it removes it.
- The rows and panel share the tab's range and average controls. Weekly bars past 182 days, today, the keyboard and the
  `role="status"` rule are #913's.

## States

As #913 §States, per tab:

| State | Macros | Nutrients |
|---|---|---|
| Loading | Skeleton cards, controls and tab row usable | The card as skeleton rows |
| Nothing logged in the range | Empty bar, `—`, `No days logged in this range.`; the week card's one-line state; the grams chart all gaps | Seven rows of `—` and `Not reported in this range`; no note line |
| Nothing logged at all | #913's `Nothing logged yet.` card replaces the tab | the same |
| Failed | `Couldn't load your log.` and **Try again**, the controls and tabs stay | the same |

A tab switch does not refetch: all three tabs read the same totals.

## Copy

| Where | Text |
|---|---|
| Tabs | `Energy`, `Macros`, `Nutrients` |
| Macros cards | `Where calories come from`, `31% of kcal`, `<1% of kcal`, `Split by week`, `% of kcal`, `Grams per day` |
| Week states | `Split by week needs two weeks with at least 3 days logged.`, `too few days to split`, `5 days logged` |
| Macro control | `Protein`, `Carbs`, `Fat` |
| Nutrients card | `Label nutrients`, `a day, on average`, the seven names, `at least 1,240 mg`, `at least, some entries didn't report it`, `Not reported in this range`, `Tap a nutrient for its chart. No target lines until targets are chosen.`, `At least: some entries don't have this one.` |
| Nutrient readout | `logged, but nothing reported this`, `at least 1,820 mg` |
| Legend | `At least (some entries didn't report it)` |

## New tokens

None. The macro colours, `--chart-*` (from #913), `--space-*` and `--text-*` are all existing names.

## Edge cases

- **One counted day.** Macros show that day's grams and shares; the week card gives its one-line state; the grams chart's
  average is the day; each nutrient row shows that day's value.
- **A macro 0 on every counted day** (no fat logged): `0 g`, `0% of kcal`, and no segment, as #864's states. Not a gap.
- **Calories but one macro `null`** (the API does not produce this): the bar is the empty bar, as #864, and the row shows `—`.
- **Alcohol or label rounding** make the macros' kcal differ from the kcal figure: shares are of the macros, as on the Day card.
- **A renamed or removed nutrient column** is not a case: the seven are fixed by #755.
- **An old range.** Days before #755 have the seven blank: their nutrient values are `null` with `unknown` absent, so they are
  gaps and are never counted as "at least" (nothing says an entry reported them or not). The row says `Not reported in
  this range` when that is all there is, and otherwise averages the days that have values.

## Out of scope

- Meals and Foods (#915, #916).
- Target lines, a recommended range, daily values, and any wording that judges a number.
- A table view of any of the charts (#913's out of scope).
- Per-meal or per-food macros (those need #915's and #916's reads).
- A way to change the macro conversion (4/4/9) or to show alcohol.
