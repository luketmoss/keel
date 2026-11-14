# 885 — Eaten: add a usual as a group, with pick-ones and the group menu

Specifies [#885](https://github.com/luketmoss/keel/issues/885), part of epic [#876](https://github.com/luketmoss/keel/issues/876).
The Add sheet, entry rows and meal cards are [`712-food-log.md`](712-food-log.md); the amount chip and inline editor
are [`882-inline-amounts.md`](882-inline-amounts.md); the meal ⋯ menu and Copy sheet are
[`884-copy-a-meal.md`](884-copy-a-meal.md); instant saves are [`785-instant-saves.md`](785-instant-saves.md). Tokens from
[`suite-language.md`](../../../ui/docs/design/suite-language.md). Layout reference: the prototype at
`876-usuals-prototype.html` (tab 2; the Yogurt bowl and After dinner cereal for the list layout). Nothing here introduces
a token.

## Main path

1. Tap **Add to breakfast**. The Add sheet's results, before any search, lead with **Usuals**: one row per usual, those
   usually for this meal first, then by last used. Row: name (bold), then the foods in short
   (`Oats · Almond butter · Blueberries / Banana / Strawberries · Milk`), the kcal as it starts at the right.
   A pick-one too long for buttons (below) reads `Natural Creamy Peanut Butter or 4 more`.
2. Searching filters usuals by name along with foods; the Usuals heading stays while any match.
3. Tap **Oatmeal**. `logUsual` with no picks. In one update the sheet closes, the four entries appear grouped, and the
   toast reads `Added Oatmeal · 4 items. Change anything below.` with **Undo** (deletes the group's entries).

## A group in a meal card

- **Heading row**, above its entries: the group name (bold, `--text-base`); a `Usual` chip when the group came from a
  usual (`--color-primary` on `--color-primary-light`, `--text-xs`, uppercase); a `Changed` chip (warning colours) when
  the group differs from its usual (below); then the group's total kcal at the right and a **⋯** button (44px,
  `aria-label="Oatmeal options"`).
- **Entries** sit under it, indented by `--space-sm` with a 2px `--color-primary-light` rule at their left. Each is
  #712's entry row with #882's chip.
- Groups and loose entries keep `logged_at` order; a group sits where its first entry would.
- A group with one entry left still shows its heading.

## Pick-ones on a day

An entry whose usual line is a pick-one shows the choice under its row.

**Buttons**, when the line has **3 options or fewer** and every option's label (its short name, else its full name)
is **20 characters or fewer**: a wrapping row of pills, the logged one pressed. Tapping another swaps the entry to that
option at the amount the usual gives it (`updateLogEntry` with `food_id`, `qty`, `unit`), patched in place.

**List**, otherwise: a single pill-shaped button `Pick one · 2 of 5 ▾` (`aria-expanded`). It opens, under the row, a
bordered list (`--radius-md`) of full-width radio rows, `role="radiogroup"`:
- a 20px radio, then the label (wrapping, never truncated) with the brand and the amount under it in `--text-xs`
  `--color-text-secondary` (`Kroger · 1 tbsp`), then the kcal at the right;
- the logged option is checked and tinted `--color-primary-light`.
Tapping a row swaps as above and closes the list. Only one list is open at a time; opening the amount editor closes it.

Chosen over pills that truncate: two of the owner's foods are "Natural Creamy Peanut Butter" and "Natural Crunchy
Peanut Butter", identical when cut off.

## What "changed" means

A group from a usual is **changed** when, compared with the usual's lines: a line's entry is missing; an entry has been
added; an Always line's food differs; or an entry's amount differs from the amount the usual gives that food. Picking a
different pick-one option is not a change.

## The group's ⋯ menu

A bottom sheet titled with the group name:

1. **Update the Oatmeal usual** — sub-line lists the differences, ` · `-separated:
   `Peanut butter instead of Almond butter · Oats ¾ cup, was ½ cup · Chia seeds added · Milk removed`.
   Disabled with the sub-line `Matches your usual` when nothing differs. Tap: `upsertUsual` with the group's entries as
   the lines, keeping pick-one lines and their other options (the picked option's amount becomes what the group has).
   Toast `Updated Oatmeal. Next time it starts like this.`; the `Changed` chip goes.
   Only shown for a group from a usual that still exists.
2. **Copy to…** — #884's Copy sheet for this group only (`copyMeal` with `group_id`).
3. **Ungroup** — `Keep the 4 entries, drop the heading`. `setLogGroup` `null`. Toast `Ungrouped`.
4. **Remove all 4** (`--color-danger-text`). Deletes the group's entries (`deleteLogEntry` `ids`). Toast
   `Removed Oatmeal` with **Undo** (re-logs them with `logGroup`, keeping the name; the new entries are a new group with
   no usual link — acceptable for an undo within 5 s).

#886 adds **Make it a pick-one** and the swap picker; #886 also adds **Save as a usual** for a group without a usual.

## States

| State | Shows |
|---|---|
| Usuals loading | The Add sheet shows foods as today; the Usuals section appears when they arrive (no placeholder) |
| Usuals failed | No Usuals section; foods work |
| No usuals | No Usuals section |
| Logging a usual | The tapped row disabled with `aria-busy` |
| Log failed | `role="status"` line at the top of the sheet: `Couldn't add Oatmeal. Try again.` |
| Pick or menu action saving | The control disabled with `aria-busy` |
| Pick or menu action failed | Toast `Couldn't save. Try again.`; the screen keeps the stored state |

## Edge cases

- The usual was deleted after the group was logged: no `Usual` chip, no `Changed`, no Update item (#877 cleared the
  link).
- An entry's food was deleted: #712's removed-food row inside the group.
- A pick-one option's food has no nutrition: its row shows `—` for kcal.
- Twelve options: the list scrolls within the screen, not inside itself.
- 375px: heading row keeps name, chips and kcal on one line when they fit, otherwise the chips wrap under the name.

## Copy

`Usuals` · `<label> or <n> more` · `Added <usual> · <n> items. Change anything below.` · `Undo` · `Usual` · `Changed` ·
`<group> options` · `Pick one · <i> of <n>` · `Update the <usual> usual` · `<food> instead of <food>` ·
`<food> <amount>, was <amount>` · `<food> added` · `<food> removed` · `Matches your usual` ·
`Updated <usual>. Next time it starts like this.` · `Copy to…` · `Ungroup` · `Keep the <n> entries, drop the heading` ·
`Ungrouped` · `Remove all <n>` · `Removed <group>` · `Couldn't add <usual>. Try again.` · `Couldn't save. Try again.`
