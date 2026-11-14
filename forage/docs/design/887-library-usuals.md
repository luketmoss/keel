# 887 — Library: the Usuals segment and its editor

Specifies [#887](https://github.com/luketmoss/keel/issues/887), part of epic [#876](https://github.com/luketmoss/keel/issues/876).
The Library screen, its Recipes/Foods segments and the food sheet are [`707-food-library.md`](707-food-library.md) and
[`787-foods-by-kind.md`](787-foods-by-kind.md); instant saves are [`785-instant-saves.md`](785-instant-saves.md); the
pick-one layout rule (buttons or list, 20 characters, 3 options) is [`885-usual-as-a-group.md`](885-usual-as-a-group.md);
the amount stepper is [`882-inline-amounts.md`](882-inline-amounts.md). Tokens from
[`suite-language.md`](../../../ui/docs/design/suite-language.md). Layout reference: the prototype at
`876-usuals-prototype.html` (tab 4). Nothing here introduces a token.

## Segments

Library's segmented control gains a third segment: **Foods · Usuals · Recipes**, in that order. It opens on Foods
(#873) or on the segment last used, whichever #873 settles; this issue only inserts Usuals between them. Each segment
keeps its own header action: Usuals shows **＋ New usual** where Foods shows **Add food** and Recipes **Import**.

## The Usuals list

One row per usual, sorted by last used (most recent first), then by name. Row, a button opening the editor:
- line 1: the name, bold;
- line 2: the foods in short, ` · `-separated; a pick-one shows its labels `A / B / C` when it would be buttons by #885's
  rule, otherwise `<last pick's label> or <n> more`; wraps;
- line 3: `<slot> · used 12 times, last yesterday`, or `<slot> · not used yet`;
- right: the kcal as it starts (`start` from `getUsuals`), `about 412 kcal` when partial.

Below the list: #888's combos section.

| State | Shows |
|---|---|
| Loading | Three skeleton rows |
| Failed | `Couldn't load your usuals.` and **Retry** |
| Empty | `No usuals yet. Save one from a meal in Eaten, or start one with ＋ New usual.` |

## The editor

A full screen inside Library (the list's place; the tab bar stays), opened by a row or **＋ New usual**. Header: **‹
Usuals** (back) at the left, `Changes save as you go` in `--text-xs` `--color-text-secondary` at the right.

1. **Name**, a text field, at most 120 characters. Saves 600ms after typing stops, and on blur.
2. **Usually for**: pills Breakfast, Lunch, Dinner, After dinner, Snacks; single-select.
3. **Foods (n)**: one block per line, separated by hairlines.
   - **Always line:** food name (bold) with ↑ ↓ × icon buttons (44px, `aria-label` `Move up` / `Move down` / `Remove
     line`) at the right; under it the stepper (`− ½ cup +`) with `40 g · 156 kcal` beside it; under that the **Pick each
     time** switch.
   - **Pick-one line:** a `Pick one` chip in place of the name, then one bordered block per option (full width,
     `--radius-md`): the full name (wrapping) and `brand` under it (`No brand` when blank; ` · starts here` on the
     last pick), a **Short name** field (placeholder `Short name (saved to the food)`, at most 20 characters), and ×
     (`Remove <food>`). Then a dashed **＋ Option** pill opening a food search; then a line in `--color-text-secondary`
     saying how it shows on a day: `On a day these show as buttons on the row.` or `On a day this shows as a list you
     open, because there are more than 3 options.` / `…because a name is longer than 20 characters. Short names on the
     foods can turn it back into buttons.` The stepper edits the amount of the option that starts.
   - Switching **Pick each time** on turns the line into a pick-one with its food as the first option and opens the
     option search; switching it off keeps the option that starts, as an Always line. Removing options down to one
     makes it an Always line.
4. **＋ Add a food** — a food search; the food is added as an Always line at its first serving, quantity 1.
5. A numbers card: kcal `as it starts`, the split bar, protein, carbs and fat.
6. **Delete usual** (`--color-danger-text`). Tap: an inline confirm block replaces it: `Delete Oatmeal?`,
   `Days you logged it keep their entries.`, **Delete** (danger) and **Keep it**.

**Saving:** every change (step, reorder, switch, option, slot, food) calls `upsertUsual` with the whole usual, debounced
600ms so a run of steps is one call. While one is out, `Saving…` replaces `Changes save as you go`; when it answers,
`Saved`; after 2 s the hint returns. The editor shows the reply. A **short name** saves the food (`upsertFood`,
`short_name`) 600ms after typing stops, and updates the Foods store.

**New usual** creates a usual named `New usual`, usually for the meal of the current time of day (before 10:30
Breakfast, before 15:00 Lunch, before 19:30 Dinner, before 21:00 After dinner, else Snacks), with no lines, and opens it
with the food search open.

| State | Shows |
|---|---|
| Save failed | `Couldn't save. Your changes are kept here.` with **Try again**, `role="status"`, under the header; the editor keeps the unsaved state |
| Short name too long | Not possible (field limit) |
| Delete failed | Toast `Couldn't delete Oatmeal. Try again.`; the editor stays |
| Deleted | Back to the list without it; toast `Deleted Oatmeal` |
| A food was deleted elsewhere | Its line shows `A removed food` and only ×; the usual can still be edited |

## Edge cases

- Leaving the editor (back, another tab) with a save pending sends it first.
- A usual with no lines shows `No foods yet.` in place of the Foods list and **＋ Add a food**.
- The same food twice as Always lines is allowed (two scoops logged separately); twice in one pick-one is not (the
  search hides foods already in that line).
- 375px: option blocks are full width; the short-name field sits under the name; nothing scrolls sideways.

## Copy

`Foods` · `Usuals` · `Recipes` · `＋ New usual` · `used <n> times, last <when>` · `not used yet` · `about <n> kcal` ·
`Couldn't load your usuals.` · `Retry` · `No usuals yet. Save one from a meal in Eaten, or start one with ＋ New usual.` ·
`‹ Usuals` · `Changes save as you go` · `Saving…` · `Saved` · `Name` · `Usually for` · `Foods (<n>)` · `Pick each time` ·
`Pick one` · `Short name (saved to the food)` · `starts here` · `No brand` · `＋ Option` · `＋ Add a food` ·
`as it starts` · `Delete usual` · `Delete <usual>?` · `Days you logged it keep their entries.` · `Delete` · `Keep it` ·
`Deleted <usual>` · `Couldn't save. Your changes are kept here.` · `Try again` · `Couldn't delete <usual>. Try again.` ·
`No foods yet.` · `A removed food` · `New usual`
