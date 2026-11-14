# 864 — Eaten day card: split bar and More nutrition as parts of the whole

Specifies [#864](https://github.com/luketmoss/keel/issues/864), the first child of epic
[#863](https://github.com/luketmoss/keel/issues/863). The direction (a split bar, three columns, carbs and fat as bars
of their parts) was agreed on a prototype and is not reopened here; this note settles the details. Tokens, spacing and
touch targets come from [`suite-language.md`](../../../ui/docs/design/suite-language.md), including §Data colours
("it always carries its word", never colour alone) and §Showing data ("blank is not zero"). The day card, its states and
its numbers are [`712-food-log.md`](712-food-log.md); the More nutrition block, its toggle, its "at least" wording and
its unknown handling are [`756-label-nutrition.md`](756-label-nutrition.md). This note amends the day card of both and
changes nothing else in them. There are no standing documents in `forage/docs/design/` beyond #702 and #704. Every
length is a token except the ones under §New tokens.

Frontend only. The numbers are the day's `getFoodLogTotals` figures as the card has them today; nothing here adds up
entries. The only arithmetic is shares and percentages of figures the API already gave.

## What changes, and what does not

**Changes (day card only):** the `Protein 62 g · Carbs 140 g · Fat 48 g` line becomes a split bar and three columns;
the More nutrition list, when open, becomes parts-of-the-whole bars for carbs and fat plus plain rows for cholesterol
and sodium.

**Does not change:** the calorie figure and its label, the `Low` chip and its line, every day-card state's calorie
text, the toggle (a 44px text button, `aria-expanded`, `aria-controls`), its one remembered open state (the same
`localStorage` key, shared with the other surfaces), and the loading, nothing-logged, all-unknown and failed states
of #712. The other surfaces that show More nutrition (the food sheet, the recipe Nutrition sheet and the amount sheet;
the food form has its own fields) keep the indented list: the issue is the day card, and a food or recipe is not a day made of
parts. They open and close together with the day card as before. Chosen over restyling all five because the amount
sheet and food sheet are per-food figures with no daily context, and #866 reuses the day card's bar, not theirs.

## The split bar and its columns

Under the kcal figure, full width:

1. **The bar.** One horizontal bar, `--space-md` tall, `--radius-full`, with three segments in the order Protein,
   Carbs, Fat, each as wide as its share of the macro calories. Between segments a gap of `--macro-gap` in the card
   surface colour, so adjacent segments are told apart by more than their hue.
2. **Three columns**, equal width, left to right in the bar's order, gap `--space-sm`. Each column:
   - line one: a swatch (a rounded square the size of the text, `--radius-sm`, in the segment's colour) and the name in
     `--text-sm` `--color-text-secondary`: `Protein`, `Carbs`, `Fat`
   - line two: the grams, whole numbers with `g`, `--text-xl`, weight 700, tabular figures, `--color-text`
   - line three: `27% of kcal` in `--text-xs` `--color-text-secondary`

### How the shares are worked out

A macro's calories are grams times 4 (protein), 4 (carbs) or 9 (fat). A share is its calories over the three added
together, not over the card's kcal figure: the figure can carry calories the macros do not (alcohol, rounding in the
label), and a bar of the macros should fill. The words say "of kcal" because that is how a label reader thinks of it.
Percentages are whole numbers; the three are rounded by the largest-remainder rule so they always add to 100 (so
`27% · 45% · 28%`, never `27 · 45 · 29`). A share that is above 0 but would round to 0 reads `<1% of kcal`, and its
segment is drawn at least `--space-xs` wide so a real value is never invisible (the others give up that width).

### The bar's states

| State | Bar | Columns |
|---|---|---|
| Loading | The skeleton card as #712: no bar, static under reduced motion | none |
| Nothing logged, or all entries unknown | An empty bar, one segment of the track colour, so the card is the same height on every day | the three names and `—` in `--color-text-muted`, no third line |
| Logged | Three segments | grams and shares |
| Low (partial or unknown entries) | Three segments, from the counted figures | grams and shares; the existing `Low` chip and line stay under the More nutrition toggle, unchanged. The shares are of what is counted, as the figures are |
| Any macro `null` while the others are not (the API does not produce this, and the card must not break if it does) | The empty bar | `—` for the null one, and no third line on any column, because a share of a partial set would be wrong |
| All three macros 0 with calories above 0 | The empty bar | `0 g` in each, no third line (a share of nothing is not 0%) |
| One macro 0 | Two segments; the zero macro has none | `0 g`, `0% of kcal` |
| Failed | Nothing: #712's failed state shows no card | none |

`—` carries the accessible name "not known" as #756 says. The bar is `role="img"` with an `aria-label` that says the same
thing the columns do: "Calories by macro: protein 27%, carbs 45%, fat 28%." An empty bar's label is "Calories by macro:
not known." The columns are text, so the card makes sense without the bar and without colour.

Segments do not animate: they take their widths on render, and when the day changes the card is swapped, as #712's
numbers are today. There is nothing for reduced motion to remove.

## More nutrition, opened: parts of the whole

The toggle is as #756 describes. Opened, the day card shows, in this order, a **Carbs** group, a **Fat** group, and two
plain rows. The block keeps #756's `<dl>` semantics for the rows; the bars are `aria-hidden` decoration for the rows
beside them, which carry every figure, so nothing is said only by a bar.

### A group

A group has a heading row, a bar, and its listed parts.

- **Heading row:** the macro's name and its grams, as #756's `Fat 48 g` / `Carbs 140 g` rows: `--text-sm`, weight 600,
  name left, figure right.
- **The bar** is `--space-sm` tall, `--radius-full`, the width of the card, and stands for the macro's own grams. Its
  empty remainder is the track colour (`--macro-track`). Parts are laid out from the left with `--macro-gap` between
  them, each as wide as its grams over the macro's grams:
  - **Carbs:** the **Sugars** slice, then the **Fiber** slice. **Added sugars** is drawn inside the sugars slice, at its
    left end, in the darker `--color-macro-carbs-added`, so the slice reads as one sugars piece with an added part in
    it. **Fiber** is striped (the carbs colour in diagonal stripes of `--macro-stripe` on the card surface), so it is a
    different kind of thing from sugars, and not merely another shade. What is left of the bar (starch and the rest) is
    the track and is not listed: the label does not name it, and neither does the API.
  - **Fat:** the **Saturated fat** slice, then the **Trans fat** slice in `--color-macro-fat-trans`. What is left is the
    track.
- **The listed parts**, under the bar, one row each, in the bar's order: Sugars, Added sugars (indented by `--space-md`,
  as #756 indents it), Fiber; Saturated fat, Trans fat. A row has the swatch (the slice's colour; fiber's is the
  striped one), the name, and on the right the figure; under the name, in `--text-xs` `--color-text-secondary`, the
  share of its parent, `34% of carbs`. Added sugars' parent is sugars: `42% of sugars`. A row is never taller than it
  needs, and wraps its name rather than truncating it.

Grams are whole numbers on the day card (#756's rule for this surface), so trans fat of 0.5 g reads `1 g`; the share is
worked out from the figure the API gave, not from the rounded one. Percentages are whole numbers, `<1%` below one, and
not forced to add to anything: parts of a macro are not a partition.

### The plain rows

**Cholesterol** and **Sodium** have no parent macro, no bar and no share. They are #756's two rows exactly: name left,
`210 mg` / `1,840 mg` right, tabular, with a thousands separator. They follow the groups, under a hairline
(`--color-border-light`) so they read as separate from the parts above them.

### Unknown, at least, and zero

Everything #756 decided about these holds; this is how it looks on a bar.

| Case | What shows |
|---|---|
| A part is unknown (`null`) | Its row's figure is `—` (accessible name "not known") with no share line, and it has no slice. The group's other parts are drawn to their own scale: a missing part does not stretch the others |
| A part is "at least" (its `unknown` count is above 0) | Its slice is drawn at the figure the API gave. Its row reads `at least 20 g`, and its share line `at least 34% of carbs`. The note under the block, in `--color-text-secondary`, is #756's: "At least: some entries don't have this one." It appears once, when any row reads "at least", and it is words, never colour alone |
| A part is 0 | `0 g`, `0% of fat`, no slice (trans fat is often 0) |
| Added sugars known, sugars unknown | Added sugars is drawn at the left of the carbs bar, in its colour, with `—` in its share line: "share of sugars not known" |
| A group's parent is 0 | The bar is empty and the parts show their grams without shares |
| Sugars and fiber together are more than carbs (they come from different entries, so the API does not forbid it) | The bar's scale is the larger of the carbs figure and sugars plus fiber, so both slices fit, and the shares are still each part over carbs, so they can add to more than 100. The figures are shown as given |
| All seven unknown | #756's one line replaces the whole block, groups and plain rows both: "None of today's entries has sodium, fiber or the rest yet." |
| Only cholesterol or sodium known | The groups still show, with the empty bars and `—` rows, then the plain rows; this keeps the block's shape the same from day to day |
| More nutrition on a "Nothing logged" or "All entries unknown" day | Not shown, as #756 says |

## Colours

Macro colours are Forage's own data colours, so they live in Forage's `global.css` as named tokens, in a light and a
dark set. They are **not** added to the shared `ui/tokens/` sheet: they are no other app's, and a change there would be
a human-reviewed path. They are not status colours and do not use `--color-success` or `--color-warning`.

The two rules from the suite language: a segment always sits beside its word (the columns name them; so does every
listed part), and colours that could be close for a colour-blind reader are told apart by lightness and by a gap, not
by hue. The three macros differ in lightness in both themes; fiber differs by a stripe; added sugars and trans fat by a
darker or lighter shade of their parent.

**Measured contrast.** WCAG relative luminance, from the hex values in §New tokens. The bar fills are graphical objects
(3:1 against the surface they sit on); the swatches duplicate them. The text in the card is `--color-text` and
`--color-text-secondary`, unchanged.

| Token | Light, on `#ffffff` | Dark, on `--color-surface` `#1a1a1e` | Dark, on `--color-surface-raised` `#252528` |
|---|---|---|---|
| `--color-macro-protein` | 5.42 | 6.97 | 6.14 |
| `--color-macro-carbs` | 3.79 | 9.31 | 8.20 |
| `--color-macro-fat` | 9.48 | 3.85 | 3.39 |
| `--color-macro-carbs-added` | 9.99 | 3.33 | — |
| `--color-macro-fat-trans` | 4.53 | 7.81 | — |

The prototype's light amber, `#d08a00`, measured 2.87 on white, which is under 3:1, so the light carbs colour is
darker here (`#b87400`, 3.79). The day card sits on `--color-surface`; the raised surface figures are for #866's meal
cards, in case they sit on it. Light lightness order, lightest to darkest: carbs, protein, fat. Dark, from darkest to
lightest: fat, protein, carbs. The track, `--macro-track`, stands for the unnamed rest and carries no information of its
own, so it has no contrast requirement; it is the card's `--overlay-md`.

## Reuse by #866

The bar is a component of its own, not a function of the day card, so the meal cards can use it:

- **`MacroBar`** (in `forage/frontend/src/ui/`): takes the three grams (each `number | null`), a `size` (`"day"` is
  `--space-md` tall, `"meal"` is a thinner one #866 settles) and returns the bar alone. It owns the share arithmetic
  above (the 4/4/9 conversion, largest-remainder rounding, the `<1%` rule, the minimum segment width, the empty
  states) and the `role="img"` label. It does not draw the columns, which are the day card's.
- **`PartsBar`** takes a parent's grams and its ordered parts (`{ key, grams, colour, striped, inside }`) for the two
  groups.
- The share arithmetic is a pure function, tested without rendering.

#866 may rely on nothing else from this issue: the columns and the groups are the day card's.

## Edge cases

- **375px.** The card's inner width is 375 less the content padding (2 × `--space-md`) and the card's own (2 ×
  `--space-md`), 311px. Three columns with `--space-sm` between them give 98px each. `27% of kcal` at `--text-xs` and
  `Protein` with its swatch fit that width without wrapping, and the grams, at `--text-xl`, fit up to `9,999 g`.
  The columns wrap their words rather than truncating them, and nothing scrolls sideways. This is arithmetic, not a
  reading of the running app: no browser session could be opened for this note, and `/test` measures it with
  `getBoundingClientRect()` per `stack-web`.
- **Very small macro.** Any non-zero share is visible (the minimum segment width above).
- **A day with only one macro known to be above 0** (water, protein powder): one segment fills the bar.
- **Rapid toggle** taps flip the state each time; nothing is fetched (#756).
- **Day change.** The card is replaced by the new day's, or by the skeleton while it loads. There is nothing to
  animate between.
- **Dark theme.** The segments, swatches and stripes use the dark set; the gap is the card surface, so it follows the
  theme. The card does not read `prefers-color-scheme` itself: the existing `[data-theme]` attribute switches the
  tokens, as it does for the rest of Forage.
- **Forced colours.** Segments keep their widths, and the columns and rows carry every figure in text, so nothing is
  lost when the fills are overridden.

## Accessibility

- The day card stays one `role="group"` named "Totals for <date>". The split bar is `role="img"` with a label; the
  columns are text, readable as `Protein 62 g, 27% of kcal`.
- The More nutrition rows are the `<dl>` of #756; every figure and share is text. The part bars are `aria-hidden`.
- Colour is never alone: every segment has its name beside it, the swatches repeat the colour but not the meaning,
  and "at least", `—` and `<1%` are text.
- The toggle is unchanged: 44px or more, `aria-expanded`, `aria-controls`.

## Demo mode

`?demo=true` shows all of it. The demo day (#712) already has logged entries with macros and the seven (#756). The
demo data must make these visible, adding to it where it does not: the day card's three segments at distinct shares;
a carbs bar with sugars, added sugars and fiber all set; a fat bar with saturated fat and trans fat, trans fat 0 on at
least one food or a small non-zero one; and one part with an "at least" count so the note shows. The day before has no
sugars, so that day shows the `—` rows.

## Tests

Pure functions, no rendering: the share arithmetic (4/4/9, sums to 100 by largest remainder, `<1%`, 0/0/0, a null
macro, one macro 0) and the parts arithmetic (a part over its parent, the sugars-plus-fiber-over-carbs scale). Component
tests, from the stylesheet and the DOM, for each row of the two state tables, `role="img"` label text, `—` with its
accessible name, "at least" and the note, the day-card states of #712 unchanged, and the toggle's remembered state. The
stylesheet's rules are held the way `layout.test.ts` holds the 44px and 375px ones: both theme token sets define every
macro token, and the light and dark carbs, protein and fat colours meet 3:1 on `--color-surface` by the WCAG formula in
the test.

## Out of scope

Meal cards (#866) and per-meal totals (#865); the other More nutrition surfaces; targets, rings and a per-meal
breakdown of the day (rejected on the prototype); any API change; a legend or tooltips on the bar (the columns are the
legend); animating segments; showing grams of alcohol or "other" calories.

## New tokens

Defined in `forage/frontend/src/global.css`, light under `[data-theme='light']` and dark under `[data-theme='dark']`.

| Token | Light | Dark | For |
|---|---|---|---|
| `--color-macro-protein` | `#2b6cb0` | `#6fa8e8` | protein: the split-bar segment and swatch |
| `--color-macro-carbs` | `#b87400` | `#f0b429` | carbs, sugars and fiber's stripes |
| `--color-macro-fat` | `#6b2e68` | `#a85aa4` | fat and saturated fat |
| `--color-macro-carbs-added` | `#5e3b00` | `#8f6508` | added sugars, inside the sugars slice |
| `--color-macro-fat-trans` | `#a35da0` | `#d79ad3` | trans fat |
| `--macro-track` | `var(--overlay-md)` | `var(--overlay-md)` | the unnamed rest of a parts bar, and the empty bar |
| `--macro-gap` | `2px` | `2px` | the surface-coloured gap between segments |
| `--macro-stripe` | `3px` | `3px` | the width of fiber's diagonal stripes |

The suite language has no data-colour tokens, so this note adds Forage's own, as the design-language rules ask, and
says that a shared set is worth deciding if another app needs one.
