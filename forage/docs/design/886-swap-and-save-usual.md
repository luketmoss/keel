# 886 — Eaten: swap a food in a usual, and save a usual from a meal

Specifies [#886](https://github.com/luketmoss/keel/issues/886), part of epic [#876](https://github.com/luketmoss/keel/issues/876).
Groups, pick-ones and the group ⋯ menu are [`885-usual-as-a-group.md`](885-usual-as-a-group.md); select mode and the New
recipe sheet are [`788-save-as-recipe.md`](788-save-as-recipe.md), amended here; the toggle row and switch styles as in
#788 and #718. Tokens from [`suite-language.md`](../../../ui/docs/design/suite-language.md). Layout reference: the
prototype at `876-usuals-prototype.html` (tab 2 for swap, tab 3 for saving). Nothing here introduces a token.

## Swap

**Where:** a text button `⇄ swap` (`--color-primary`, `--text-xs` bold) after the food name, on every entry of a group
whose line in the usual is **Always**. Not on pick-one entries (their options are already on the row), not on loose
entries, not on a group with no usual. `aria-label="Swap Almond butter"`.

**The Swap sheet** (bottom sheet):

1. Title `Swap Almond butter`; **Cancel**.
2. `Just for this day. Your Oatmeal usual stays as it is.` in `--color-text-secondary`.
3. A search field, placeholder `Search foods`.
4. When the entry's food is not the line's food (it was swapped already) and the search is empty: section **Your usual**
   with one row for the line's food, sub-line `Back to the usual · <amount>`.
5. Section **Swapped in before**: the line's `swaps` from `getUsual` (#878), most first, each sub-line
   `<n> times · <amount> · <g> g`. Hidden when empty.
6. Section **Or any food** (with a search: **Foods**): the library, filtered by name and short name, five rows before
   searching.

Each row shows what you'd get: name, the amount it would log, and kcal at the right.

**The amount carried over:** if the new food has a serving with the same name as the entry's current serving, the same
quantity of it (1 tbsp → 1 tbsp); otherwise the same weight, in the new food's first serving, rounded to the nearest
0.25 (grams stay grams).

Tap a row: `updateLogEntry` (`food_id`, `qty`, `unit`). In one update the sheet closes, the row shows the new food, and
the toast reads `Swapped in Peanut butter for this day` with **Undo** (or `Back to Almond butter`). The group gets its
`Changed` chip (#885).

## Make it a pick-one

In the group ⋯ menu, after **Update the … usual**, one item per entry that is a swapped Always line:
**Make it a pick-one: Almond butter / Peanut butter**, sub-line `Both become options, and you choose each time`.
When the line's `swaps` count for this food is **3 or more** (this swap included), a `Suggested` chip precedes the text
and the sub-line starts `You've swapped this line 4 times. `.

Tap: `upsertUsual` turning that line into a pick-one of the two foods, each at its own amount (the line's for the old
food, the entry's for the new), `last_pick` the new food. The entry becomes a pick-one entry (#885's buttons). Toast
`Oatmeal now asks: Almond butter or Peanut butter`.

## Save a usual from a meal

#788's select mode foot changes. The meal ⋯ menu's **Select** (#884) enters it.

- **Foot**, with ticks: primary **Save 3 as a usual**, and under it a secondary (`btn-secondary`) **Save 3 as a recipe**,
  which opens #788's New recipe sheet unchanged. With nothing ticked both are disabled with #788's helper line
  `Tick the items that go together.`
- Recipe entries stay unselectable as in #788 (`Recipes can't go in a recipe` becomes `Recipes can't go in a usual or a
  recipe`).

**New usual sheet** (bottom sheet, title `New usual`, **Cancel**):

1. **Name**, text, placeholder `Turkey sandwich`, focused on open, at most 120 characters.
2. **Foods (3)**: one hairline row per ticked entry in logged order: name (bold) and amount; at the right a **Pick each
   time** switch (`aria-pressed`), off by default. Switching on shows a line under it: `Options: Cheddar · Swiss cheese ·
   Provolone`. The list is the food first, then up to four foods of the same `category` logged in the last 60 days,
   most logged first. It also has a `＋ add` text button that opens a food search to add another option and `×` on each
   option but the first. With no candidates, the search opens at once. A pick-one needs two options:
   **Save usual** is disabled while a switched-on line has one, with the line `Add a second option, or switch this off.`
3. A numbers card: total kcal `as saved`, protein, carbs and fat.
4. `Saved from Lunch today. Your log stays as it is.` (`today` / `on <day>`).
5. **Save usual**, primary, disabled while the name is blank.

Save: `upsertUsual` with the slot the meal is in, then `setLogGroup` on the ticked entries with the new usual (so they
become its first group). In one update the sheet closes, select mode ends, the entries show as a group with the `Usual`
chip, and the toast reads `Saved Turkey sandwich to your usuals`.

A group **without** a usual (from a combo or a copy of one) gets **Save as a usual** in its ⋯ menu
(`Use these 3 as a starting point`), opening the same sheet with the group's entries and name.

## States

| State | Shows |
|---|---|
| Swap sheet loading the usual's swaps | Sections 3 and 6 show; **Swapped in before** appears when `getUsual` answers |
| Swap failed | `role="status"` in the sheet: `Couldn't swap. Try again.` |
| Saving a usual | `Saving…`, `aria-busy`, fields disabled |
| Usual saved, grouping failed | The usual exists; toast `Saved Turkey sandwich. Couldn't group today's items.` |
| Save failed | `Couldn't save. Your changes are kept here. Try again.` (as #788) |

## Copy

`⇄ swap` · `Swap <food>` · `Just for this day. Your <usual> usual stays as it is.` · `Search foods` · `Your usual` ·
`Back to the usual` · `Swapped in before` · `<n> times` · `Or any food` · `Foods` · `Swapped in <food> for this day` ·
`Back to <food>` · `Make it a pick-one: <a> / <b>` · `Suggested` · `You've swapped this line <n> times.` ·
`Both become options, and you choose each time` · `<usual> now asks: <a> or <b>` · `Save <n> as a usual` ·
`Save <n> as a recipe` · `Recipes can't go in a usual or a recipe` · `New usual` · `Pick each time` · `Always` ·
`Options:` · `＋ add` · `as saved` · `Saved from <meal> <today|on day>. Your log stays as it is.` · `Save usual` ·
`Saved <name> to your usuals` · `Save as a usual` · `Use these <n> as a starting point` · `Couldn't swap. Try again.` ·
`Saved <name>. Couldn't group today's items.`
