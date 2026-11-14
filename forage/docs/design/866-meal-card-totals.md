# 866 — Eaten meal cards: kcal, split bar and macro line

Specifies [#866](https://github.com/luketmoss/keel/issues/866), the last child of epic
[#863](https://github.com/luketmoss/keel/issues/863). The direction (kcal in the header, a thin split bar, one text
line of macros then sodium and fiber) was agreed on a prototype and is not reopened here; this note settles the
details. Tokens, spacing and touch targets come from [`suite-language.md`](../../../ui/docs/design/suite-language.md),
including §Data colours ("it always carries its word") and §Showing data ("blank is not zero"). The meal cards are
[`712-food-log.md`](712-food-log.md) (and select mode [`788-save-as-recipe.md`](788-save-as-recipe.md), the fifth slot
[`826-after-dinner-slot.md`](826-after-dinner-slot.md)); the split bar, its colours and its share arithmetic are
[`864-day-card-macro-bars.md`](864-day-card-macro-bars.md); the numbers are #865's `getFoodLogTotals` with
`by_meal: true`. None is restated. There are no standing documents in `forage/docs/design/` beyond #702 and #704.
Every length is a token; nothing here introduces one.

This note amends 712's "There is no per-meal total (the day card is the only sum)": there is one now, and it comes
from the API. The app still adds nothing up.

## What changes, and what does not

**Changes (meal cards only):** a card whose meal has logged entries gains its kcal in the header, under the header a
thin split bar, and under that one text line of macros, sodium and fiber.

**Does not change:** the day card; the entry rows, planned rows, Add row and **Select**; select mode and its save
button; every sheet; a meal with no entries (its Add row only, as 712 says); the screen's loading and failed states.
Planned rows count toward nothing, as before: a meal with a planned row and no entries has no totals.

## Where the numbers come from

`loadDay` asks `getFoodLogTotals(date, date, true)` (#865's `byMeal` argument, which sends `by_meal`) and keeps the
day's `meals` with the day. A card looks up its slot there. The card shows the API's figures and nothing else; the only
arithmetic is #864's shares of figures the API gave, done by `MacroBar`. A day total can differ from the sum of the
meals' by a gram on screen, since the day is rounded once (#865); nothing corrects it.

## The card

Header row, left to right: the meal name (unchanged); then, pushed right, the **Low** chip when the meal is partial,
the kcal figure, and **Select** when the meal offers it (unchanged, a 44px text button).

- **kcal.** The whole number in weight 600, tabular figures, then `kcal` in `--text-sm` `--color-text-secondary`
  (the log row's `log-row-kcal` and `hint-inline` styles): `412 kcal`, `1,240 kcal`. Just `kcal`, never `so far`: a
  meal is not the growing total the day card is.
- **Low chip.** The existing `chip-flag low-chip`, text `Low`, before the figure. Its accessible name is
  "Low: some entries have no nutrition or are missing ingredients", so the sentence the day card spells out is not
  lost. Shown when `partial` is true and kcal is known.
- Under the header, **the bar**: `MacroBar` (#864) in its `"meal"` size, full width, `--space-sm` tall (thinner than
  the day's `--space-md`; this is the size #864 left to this issue). It keeps #864's `role="img"` label, "Calories by
  macro: protein 27%, carbs 45%, fat 28%.", and every rule of its states: segments, the gap, the `<1%` minimum width,
  the empty bar. It sits `--space-xs` under the header.
- Under the bar, **the line**, `--text-sm` `--color-text-secondary`, tabular figures, `--space-xs` under the bar, in
  two groups that wrap as groups: `P 22 g · C 36 g · F 16 g |` then `Sodium 160 mg · Fiber 4 g`. The `|` ends the first
  group (so a wrap leaves it at the end of line one, never at the start of line two); it is `aria-hidden`, and the
  groups' own accessible text is the line's words. Order is the bar's: protein, carbs, fat. The letters are plain text
  in the line's colour, with no swatches: the bar is directly above in the same order, the day card is the legend, and
  nothing is said only by a colour.
- Then the entries, planned rows and Add row, as now.

### Figures

| Figure | Shown as |
|---|---|
| P, C, F, Fiber | whole grams: `22 g`. A value above 0 that would round to 0 reads `<1 g`, so a real value is never shown as a zero |
| Sodium | whole mg with a thousands separator: `1,840 mg`. Above 0 and under 1 reads `<1 mg` |
| Sodium or Fiber known, and `unknown.sodium_mg` (or `fiber_g`) above 0 | the number then `+`: `Sodium 300+ mg`, `Fiber 4+ g`. "At least", in the compact form: the day card's note is not repeated per meal |
| Sodium or Fiber `null` | `—` with the accessible name "not known" (the same `—` as #756): `Sodium —`. Never `0` |

Whole numbers match the day card and the log rows. `+` appears only for the two figures the line carries; P, C and F
have no per-macro counts in the API, and the **Low** chip is their signal. An entry with no nutrition at all is in
`unknown_entries`, not in `unknown.*`, so it adds no `+`; it makes the meal partial, so the chip says so.

## States

| State | Header | Under it |
|---|---|---|
| Loading (day not ready) | name only | nothing; the Add row as 712 says |
| No entries | name only | nothing: the Add row only |
| Logged, complete | kcal | bar and line |
| Logged, partial | `Low` chip and kcal | bar and line, from the counted figures |
| Every entry has no nutrition (`kcal` null) | `—` in place of the figure, with the accessible name "not known" | no bar and no line; one line in `--color-text-secondary`: "None of these entries has nutrition yet." |
| Kcal known, all three macros 0 (water, black coffee) | kcal | `MacroBar`'s empty bar, and `P 0 g · C 0 g · F 0 g | …` |
| Entries present, but the day's `meals` has no row for the slot | name only | nothing yet (see below). Never `—` or `0`: absent is "not here yet", not "unknown" |
| The day has `meals` row for the slot but the card has no entries | name only | nothing: entries decide whether a card has totals |
| The API answered without `meals` (an app newer than the deployed API) | as today | nothing; the cards behave as before this issue |
| Select mode | unchanged | bar and line stay: they describe the meal, and ticking changes nothing in them |

**A save in flight.** After a save, delete or move, the entries change at once (the row is patched in) and the totals
catch up behind them, quietly (#785). Until they do the card keeps the figures it had; a meal that has just gained its
first entry has none yet and shows none until the refresh lands. Nothing blanks and nothing animates. Moving an entry
between meals moves its numbers between the two cards when the refresh lands, and the day card does not change.

## Edge cases

- **375px.** The header's inner width is 311px (375 less the content padding and the card's, 2 × `--space-md` each).
  Measured in the running app (demo mode, 375px emulated, `getBoundingClientRect()` on the live text styles): the
  card is 343px wide; "After dinner" at `--text-base` weight 700 is 92px, `1,240 kcal` 72px, the `Low` chip 30px,
  **Select** 59px, so with the gaps the header row is about 263px and fits on one line with a four-digit figure and the
  chip. The row may wrap (`flex-wrap`) rather than truncate.
- **The line at 375px.** At `--text-sm` with tabular figures, `P 22 g · C 36 g · F 16 g |` is 145px and
  `Sodium 160 mg · Fiber 4 g` is 163px; together 311.5px against the 311px available, so even the prototype's own
  example wraps by half a pixel, and a day-sized meal (`P 128 g · C 240 g · F 96 g | Sodium 1,840+ mg · Fiber 14+ g`,
  364px) wraps for certain. The design therefore expects two lines at 375px, wrapping at the `|`, and one line on a
  wider screen. Nothing truncates, nothing scrolls sideways, and the name of a figure is never split from its value
  (`Sodium 160 mg` is one no-break unit).
- **Large numbers.** `9,999 kcal` and `99,999 mg` fit the header; the figures wrap, never truncate.
- **A slot not in the list.** Entries under a slot the app does not list (data from before a rename) have no card, as
  today; #865 returns them in `meals` and the app does not look them up.
- **Day change.** The cards are swapped with the day, as the day card is. No animation.
- **Dark theme.** Everything is tokens; the bar's segments follow #864's dark set. #864 measured the three macro
  colours against `--color-surface` and against `--color-surface-raised`; the meal cards use the same `.card`
  surface as the day card, so its figures apply.
- **Forced colours.** The kcal, the line and the chip are text; only the bar's fills are overridden.

## Accessibility

- Each meal card stays a region labelled by its heading. The header's kcal is text after the name; the bar is
  `role="img"` with #864's label; the line is text a screen reader reads in order: "P 22 g, C 36 g, F 16 g, Sodium 160
  mg, Fiber 4 g".
- Colour is never alone: `Low`, `—`, `+` and `<1 g` are text.
- **Select** keeps its 44px target and place. Nothing new is interactive.

## Copy

| Where | String |
|---|---|
| Header | `412 kcal`, `1,240 kcal` |
| Low chip | `Low` (accessible name "Low: some entries have no nutrition or are missing ingredients") |
| Unknown kcal | `—` (accessible name "not known") |
| Line | `P 22 g · C 36 g · F 16 g | Sodium 160 mg · Fiber 4 g`; `Sodium 300+ mg`; `Fiber —` |
| All entries unknown | `None of these entries has nutrition yet.` |

## Demo mode

`?demo=true` shows it, through the demo API's `by_meal` answer (#865). The demo day (712) gives Breakfast two complete
entries (bar and line), Lunch a partial recipe and an entry with no nutrition (the `Low` chip, and `—` or `+` on the
extras where the demo foods lack them), Dinner empty (Add row only) and Snacks one entry. #864 makes the demo foods carry
the seven, so Fiber and Sodium show figures.

## Tests

The store asks for `by_meal` and exposes a slot's totals (absent slot, absent `meals`). Component tests, from the DOM,
for each row of the state table: kcal, the `Low` chip and its accessible name, `—`, the line's text in each figure case
(`<1 g`, `300+ mg`, `Fiber —`), the bar's presence and label, no totals on an empty card, a card with an entry and no
`meals` row, select mode keeping the bar, and a refresh moving an entry's numbers between two cards. The 375px
criteria are checked in `/test` with `getBoundingClientRect()` per `stack-web`. The day card's tests and the existing
meal-card tests pass unchanged apart from the extra call argument.

## Out of scope

Anything on the day card; per-meal totals through MCP (#865 leaves them out); a per-meal "of the day" share; targets
or rings; totals for planned rows; a legend or tooltips on the meal bar; showing the seven extras on a meal beyond
sodium and fiber; animating figures or segments.

## Measured

At 375px in demo mode: card width 343px, content width 311px; `P 22 g · C 36 g · F 16 g | Sodium 160 mg · Fiber 4 g`
311.5px; the two groups 145px and 163px; header contents about 263px (see §Edge cases). #864's bar height and
`--space-sm` come from its note and the shared scale.

## New tokens

None. The meal bar's height is `--space-sm`; its colours are #864's.
