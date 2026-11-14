# 870 — Amount sheet: the day card's macro visual, and no focus on the amount when it opens

Specifies [#870](https://github.com/luketmoss/keel/issues/870), a follow-up to epic
[#863](https://github.com/luketmoss/keel/issues/863). The two asks (the day card's split bar, columns and
parts-of-the-whole More nutrition on the amount sheet; no autofocus on the amount field) are the owner's and are not
reopened here; this note settles the details. The split bar, its colours, its share arithmetic and the parts groups
are [`864-day-card-macro-bars.md`](864-day-card-macro-bars.md) and are not restated. The amount sheet is
[`712-food-log.md`](712-food-log.md) (§Amount sheet); More nutrition, its toggle and its unknown handling are
[`756-label-nutrition.md`](756-label-nutrition.md). The focus pattern is
[`779-barcode-camera-first.md`](779-barcode-camera-first.md). Tokens, spacing and touch targets come from
[`suite-language.md`](../../../ui/docs/design/suite-language.md). There are no standing documents in
`forage/docs/design/` beyond #702 and #704. Every length is a token; nothing here introduces one.

Frontend only. The sheet still works out no nutrition: every figure is the API's (the dry run), and the only
arithmetic is #864's shares and percentages of figures the API gave.

## What changes, and what does not

**Changes (the amount sheet only, adding and editing, food and recipe):**

1. The numbers card swaps the `Protein 6 g · Carbs 9 g · Fat 0.4 g` line for the day card's split bar and three
   columns, and its More nutrition, when open, is the parts-of-the-whole groups (the `parts` prop) instead of the
   indented list.
2. Nothing on the sheet takes focus when it opens.
3. Two small changes the first makes necessary, both under §Focus and the stepper: the sheet's Tab trap handles focus
   on the panel, and **Less** stays focusable at its minimum.

**Does not change:** the kcal figure, its `kcal` label, `Updating…`, the `partial` chip and "Some ingredients are
left out."; "Recalculated from the food as it is now."; "Couldn't work out the calories."; the stepper's steps (0.5
serving, 10 g, never below the step), the unit select and its reset, the Meal chips, **Log it** / **Save**,
**Delete entry** and its confirmation, the preview's 400ms timing and its stale-answer guard, the remembered More
nutrition state (one `localStorage` key, shared with the Eaten day card and the other surfaces), and the sheet's
subline.

## Scope of the other sheets

**In:** the amount sheet, every way it opens: adding from the Add sheet, tapping a logged entry, the quick multi-add pass (#786), coming back from adding a food (#707), and the same sheet re-opened after
cancelling Delete. It is one component, so they cannot differ.

**Out, decided:**

- **The library food sheet** (`library/food-sheet.tsx`). It is a per-weight table with no amount field, no preview and
  nothing to keep live, so it has no keyboard problem to fix, and its numbers are a table by weight, not one figure
  that splits. Giving it the bar would mean choosing which weight the bar describes, which is a design question of its
  own, not "trivially the same". It keeps the indented More nutrition list with its "Per 1 cup (245 g)" caption.
- The recipe Nutrition sheet, the save-as-recipe sheet (`macrosLine` stays for it) and the shopping `BuyAmountSheet`
  (a pack count, no nutrition). #864 left them on the list for the same reason.

## Focus when the sheet opens

**On open, focus goes to the sheet's panel** (the `role="dialog"` element, which is already `tabIndex={-1}` and named
by its title). It is the existing `focusPanel` prop on `Sheet` (#779), so the amount sheet passes it and the field
loses `data-autofocus`. Chosen over the alternatives because:

- the panel is what #779 did for the same fault (a field taking focus raises the keyboard over the control that
  matters), so there is one answer in the app, not two;
- a screen reader hears the dialog and its name ("Greek yogurt, dialog") and then reads on into the content, which is
  the pattern for a dialog with no single obvious first control;
- **Log it** is the one other candidate, rejected: focus on the primary button makes an accidental Enter or Space log
  an entry, and on edit it would put the cursor on **Save** before the person has looked at anything.

After open, nothing is focused for them and nothing opens the keyboard. The amount is one tap on the field away;
tapping it focuses it and raises the keyboard as it does now, and the browser's own scroll-into-view applies. This
note does not manage the visual viewport.

Order by keyboard from the panel: **Close** (the header ×), **Less**, the field, **More**, the unit select, the
More nutrition toggle, the Meal chips, **Log it** (**Save**), **Delete entry**. It is the DOM order, unchanged.

### Where focus goes later

| Moment | Focus |
|---|---|
| Sheet opens (add or edit) | The panel |
| Delete entry, then **Cancel** on the confirmation | The panel again: the amount sheet is shown anew, so it does not put the cursor in the field and raise the keyboard. What was typed is kept (it is the sheet's own state) |
| The sheet closes (saved, closed, deleted) | Back to whatever opened it, as `Sheet` does today |
| A save fails | Unchanged: the sheet stays, the error line appears, focus stays where it was |

### Focus and the stepper

- **Tab and Shift+Tab with focus on the panel.** Today the trap treats only the first and last control as the
  edges, so **Shift+Tab from the panel itself** leaves the dialog for the page behind it. With `focusPanel` that is
  the first key a keyboard user presses, so `Sheet`'s trap changes: with the panel itself focused, Shift+Tab goes to
  the last control and Tab to the first. This applies to every `Sheet` (the barcode sheet already uses `focusPanel`
  and had the same gap), and the existing behaviour for focus inside is unchanged.
- **Less at its minimum.** **Less** is `disabled` when the amount is at or under the step, and a disabled button that
  has focus drops it to the page. Now that the stepper is how most people change the amount, it is the control most
  likely to be holding focus when it reaches the minimum. So at the minimum it is `aria-disabled="true"` instead:
  still focusable, announced as unavailable, and a press does nothing. It is drawn as the disabled look already is
  (`--color-text-muted`, no hover). **More** is never disabled.

## The numbers card

The card is the sheet's own, with the day card's contents. Top to bottom:

1. **kcal row**, as today: the figure in `--text-xl`, then `Updating…` or `kcal` (with `partial` for a partial
   recipe).
2. **The split bar**: `MacroBar` (#864) at `size="day"`, full width of the card.
3. **Three columns**, as the day card draws them (a swatch and name, the grams, `27% of kcal`): the same markup and
   styles, so the two cannot drift. The day card's columns are today inline in `DayCard`; they move to one component
   in `src/ui/` that both use, taking the three grams and a rounding. The day card passes whole grams and renders as
   before.
4. **More nutrition**, as today: the toggle, and open, the `parts` groups (Carbs with its bar, Fat with its bar,
   Cholesterol and Sodium as plain rows). It is shown when the preview has kcal, as today.
5. The hint lines as today (`partial`, "Recalculated…", "Couldn't work out…").

**The card's surface.** The card's background becomes `--color-surface`, as the day card's is, in place of
`--color-surface-raised` (which is also the sheet's, so today the card has no edge). #864's bar draws its gaps and its
fiber stripes in `--color-surface`, so the card must be that surface for the gaps to disappear into it; the card then
shows as a card on the sheet, as 712 calls it. The macro colours were measured on `--color-surface` in #864 (light
5.42, 3.79 and 9.48; dark 6.97, 9.31 and 3.85 for protein, carbs and fat, all over 3:1), so no new colour is measured
here. `box-shadow` stays none: it is a card inside a sheet.

### Grams on this sheet

Grams in the columns are rounded to a tenth, as the sheet has always rounded them (`macrosLine` shows `0.4 g`,
`23.4 g`), and a whole number shows without a trailing `.0`: `23 g`, `23.4 g`, `0.4 g`. A value above 0 that would
round to `0.0` reads `<0.1 g`, so a real value is never shown as a zero (the #866 rule, at this rounding). `0` stays
`0 g`. The percentages, the bar's widths and the shares in the More nutrition rows are worked out from the API's
figure, not from the rounded one, as in #864. The parts rows' figures use `rounding="tenth"` as the sheet passes it
today; they do not get `<0.1 g` (that function is shared with the food sheet, which this issue leaves alone).

### States

The sheet's states, with what the card shows. The bar and the columns follow #864's state table, with these
particulars.

| State | kcal row | Bar and columns | More nutrition |
|---|---|---|---|
| First preview not back yet (add) | `—`, `Updating…` | The empty bar and `—` columns with no third line, so the card is the same height before and after the numbers arrive | not shown |
| Preview back | the figure, `kcal` | Three segments, grams and shares | as the sheet shows it today |
| Updating after a change | the figure it had, `Updating…` | The segments and figures it had, not dimmed, not cleared. They swap together when the answer lands | unchanged until then |
| Preview failed, an earlier preview exists | the figure it had, then "Couldn't work out the calories." | The earlier figures | unchanged |
| Preview failed, none ever arrived | `—`, "Couldn't work out the calories." | The empty bar and `—` columns | not shown |
| Editing, opened | the entry's stored figure | The entry's stored macros (the first preview is the entry itself) | the entry's stored extras |
| Editing, amount or unit changed | the recalculated figure, then "Recalculated from the food as it is now." when it differs | The recalculated macros | the recalculated extras |
| Editing an entry whose stored macros are blank (older than the API's) but whose kcal is set | the kcal | The empty bar and `—` columns: a macro `null` empties the bar (#864) | `None…` line as today |
| Invalid amount (blank, 0, over 99999) | as the last valid preview | as the last valid preview; **Log it** disabled and the helper under the field as today | unchanged |
| Only the meal changes | unchanged | unchanged: moving an entry keeps its numbers | unchanged |

**Live updates.** Nothing animates: segment widths take their new values when the preview lands, as #864 says, and
the card's height does not change between answers (the empty and filled states are the same height). The bar is
`role="img"` with #864's label, so it is re-read only if a person moves to it; **Updating…** is already the
`role="status"` that announces a change in progress, and nothing else is added to it. A fast run of taps on **More**
or **Less**, or fast typing, still asks once, 400ms after the last change (the existing timer), and the answer to an
older request is dropped (the existing sequence guard); so the bar never shows a figure for an amount that is not the
one in the field for longer than 400ms plus the API's time, and never an older answer over a newer one.

### Food and recipe

The sheet is the same for both; only the target differs, and the figures are the API's.

- **A food.** Per the amount in its unit. The columns, bar and groups describe that amount, not 100 g.
- **A recipe**, in servings: one serving's figures times the amount. The bar and the columns are of the macros the API
  counted.
- **A partial recipe** (some ingredients have no nutrition, `partial` true). The bar, the columns and their shares
  are of what was counted, as the kcal figure is, and the existing `partial` chip and "Some ingredients are left out."
  stay exactly where they are: they are the signal, the bar adds none. The percentages are of the counted macros,
  which is how #864 treats a Low day.
- **More nutrition for a recipe** shows the seven as the API gave them. The dry run carries no per-nutrient
  "at least" counts, so the sheet passes none and no row reads "at least" or shows the note, exactly as today. A
  recipe's sodium or fiber may be a sum over only the ingredients that have it; that is #756's existing behaviour and
  is not changed here.
- **A recipe or food with kcal but all three macros 0** (water, black coffee): the empty bar and `0 g` columns with no
  third line, as #864's table says. Its More nutrition shows #756's one line when none of the seven is known.

## Edge cases

- **375px.** Measured in the running app (demo mode, 375px emulated, `getBoundingClientRect()`), with the Plain yogurt
  entry's sheet open: the sheet is 375px wide, the numbers card 343px, its content 311px (card padding
  `--space-md`), the same as the day card's, so the three columns are about 98px each with `--space-sm` between them.
  The widest figure the sheet can show at the tenth, in `--text-xl` weight 700 with tabular figures, measured at
  81px (`9999.9 g`; `99999 g` is 75px, `23.4 g` 58px), which fits the column. Names (`Protein`, `Carbs`, `Fat`) and
  `27% of kcal` wrap rather than truncate, and nothing scrolls sideways. The More nutrition rows are the day card's.
- **Height.** At 375×812 the sheet's maximum is 90% of the viewport, 731px. With More nutrition **closed**, the
  sheet's content measures 618px today (the card is 139px), and the bar and columns replace a 20px text line with
  about 80px, so the content is expected near 680px: **Log it** is fully visible without scrolling. With More
  nutrition **open** the sheet already scrolls today (802px of content at the same width with the list open) and the
  groups make it taller; the header is sticky and **Log it** is reached by scrolling. That is accepted: the owner
  opens the block on purpose, and the keyboard no longer covers any of it. On a shorter phone the closed sheet scrolls
  too.
- **Rapid taps on Less and More** change the field at once; the figure and bar settle once, after the last. Less at
  the minimum does nothing and keeps focus.
- **Typing then tapping a stepper.** The field loses focus to the button as always, and the keyboard goes with it.
- **Unit change** resets the amount to that unit's default (as today) and asks for a new preview; the figures it had
  stay until it lands.
- **A tiny amount** (`0.01` serving): shares are of whatever the API returned; a macro that rounds to `0.0` reads
  `<0.1 g`, its share `<1% of kcal`, and its segment is at least `--space-xs` wide (#864).
- **Dark theme, forced colours, reduced motion.** Tokens only. The segments, swatches and stripes are #864's, and the
  columns and rows carry every figure in text. The sheet's own slide-up (`sheet-up`) is unchanged.
- **Opening More nutrition on the sheet opens it on the day card too** (one remembered state), as #756 says. Nothing
  new.

## Accessibility

- The card keeps its figures as text: the columns read `Protein 23.4 g, 11% of kcal`; the bar is `role="img"` with
  #864's label; the parts bars are `aria-hidden` and every part is a row.
- Colour is never alone: the swatches repeat the colour, not the meaning; `—`, `<0.1 g` and `<1%` are text; `—`
  carries the accessible name "not known".
- The dialog is named by its title and takes focus on its panel. Escape closes it. Focus cannot leave it by Tab or
  Shift+Tab, including from the panel itself.
- **Less** keeps a 44px target and stays in the tab order at its minimum (`aria-disabled`).
- The toggle is unchanged: 44px, `aria-expanded`, `aria-controls`.

## Copy

No new strings. The columns' `Protein`, `Carbs`, `Fat` and `27% of kcal` and the groups' wording are #864's. The one
new rendering is `<0.1 g` in a column.

## Demo mode

`?demo=true` shows all of it, since #864 made the demo foods carry the seven. Opening the Plain yogurt entry shows
the card with three segments and More nutrition with parts bars; a food with no extras (or a recipe) shows the
`None…` line. No demo data changes.

## Tests

Component tests from the DOM, replacing the `amount-macros` line assertions: the bar's presence and `role="img"`
label and the three columns' text for a food and a recipe; tenth rounding (`23.4 g`, `23 g`, `0.4 g`, `<0.1 g`);
the empty bar and `—` columns before the first preview, after a failed one, and for an entry with blank macros; the
card keeping its height from empty to filled (class and structure, not pixels); a partial recipe's chip and line with
the bar; a live update (change the amount, the old figures stay with `Updating…`, then swap together; an older answer
never replaces a newer one); More nutrition open showing the groups, and the `None…` line. Focus: after opening, for
add and for edit, `document.activeElement` is the dialog panel and not `#log-amount` (and the same after cancelling
Delete); Shift+Tab from the panel lands on the last control and Tab on the first; **Less** at the minimum is
`aria-disabled`, focusable and a no-op. The day card's tests pass unchanged. The 375px criteria are checked in `/test`
with `getBoundingClientRect()` per `stack-web`.

## Out of scope

The library food sheet and every other More nutrition surface; any API change, including per-nutrient counts in the
dry run; managing the visual viewport or scrolling the sheet when the keyboard opens; selecting the field's text on
focus; changing the stepper's steps or the unit reset; a legend, tooltip, target or ring; animating figures or
segments; the day and meal cards.
