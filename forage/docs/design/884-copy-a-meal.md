# 884 — Eaten: copy a meal to another day, or repeat the last one

Specifies [#884](https://github.com/luketmoss/keel/issues/884), part of epic [#876](https://github.com/luketmoss/keel/issues/876).
The Eaten day view and meal cards are [`712-food-log.md`](712-food-log.md); select mode and its **Select** button are
[`788-save-as-recipe.md`](788-save-as-recipe.md); dated routes are [`825-eaten-by-date.md`](825-eaten-by-date.md); bottom
sheets and toasts as in [`706-recipe-import.md`](706-recipe-import.md) and [`785-instant-saves.md`](785-instant-saves.md).
Tokens from [`suite-language.md`](../../../ui/docs/design/suite-language.md). Layout reference: the prototype at
`876-usuals-prototype.html` (tab 1). Nothing here introduces a token.

## Main path: pull

1. Today, Breakfast is empty. Under its heading, above **Add to breakfast**, a suggestion button:
   **↻ Same as yesterday** with a second line `Oatmeal · Oats, Almond butter, Blueberries, Milk · 418 kcal`.
2. Tap it. In one update the four entries appear in Breakfast (grouped as Oatmeal, if they were a group), the day card
   updates, and the toast reads `Copied yesterday's breakfast · 4 items` with **Undo**.

## Main path: push

1. Viewing Thursday, tap Lunch's **⋯**. The meal menu sheet: **Copy to…** (`Another day or meal, exactly as it is`),
   **Select** (`Pick items to save as a usual or a recipe`), **Copy from another day…**
   (`Pick a day's lunch to bring here`).
2. **Copy to…** opens the Copy sheet: title `Copy lunch`, a summary line `4 items · 446 kcal · Bread, Turkey, Cheddar,
   Spring mix`, **Day** chips, **Meal** chips, and a primary button.
3. Day chips: `Today`, then each earlier day back to 6 days before today, as `Yesterday`, then `Wed 12`, `Tue 11`… and
   **Pick a date…** (a native date input limited to today and earlier). Default: `Today` when viewing an earlier day;
   when viewing today, `Today` too (copying into the same meal duplicates it, which is allowed, and another slot is the
   usual reason).
4. Meal chips: the five slots; default the meal being copied.
5. The button reads `Copy 4 items to <day>`: `Copy 4 items to today`, `Copy 4 items to Tuesday`. Under it in
   `--color-text-secondary`: `Adds to what's there already; nothing is replaced.`
6. Tap it: `copyMeal`. In one update the sheet closes and the toast reads `Copied 4 items to today's lunch` with
   **Undo**. If the target is the day on screen, its entries appear at once (#785); otherwise nothing on screen
   changes.

**Copy from another day…** opens a short sheet listing the last 7 days that have entries in this slot, newest first:
`Yesterday · Oatmeal · 418 kcal`, `Thu 12 Nov · Greek yogurt, Granola · 427 kcal`. Tapping one copies it into this meal,
same toast as the pull.

**Undo** (toast, 5 s) deletes exactly the copied entries with `deleteLogEntry` `ids`, then the day patches. Undo
failing shows the toast `Couldn't undo. The copied items are still there.`

## The "Same as…" suggestion

- Shown only on an **empty** meal, on today or an earlier day, and only when a meal with that slot has entries on one
  of the 7 days before the day shown.
- It names the most recent such day: `Same as yesterday`, else `Same as Thursday` (within the week), using
  #712's day words.
- Second line: the group name and food names (short names where set, #880), comma-separated, then the total kcal; it
  wraps to at most two lines and then ends with `…`. A meal with no known calories omits the kcal.
- While the day is loading or failed, it's hidden. While its lookup is out, it's hidden (no placeholder).
- The lookup reads the 7 days before the day shown with one `getFoodLog` range call when the day loads, cached for the
  page load.

## Select moves into the menu

#788's **Select** text button in the meal header is replaced by the **⋯** button (44px), which opens the meal menu
above. **Select** in the menu enters #788's select mode unchanged except for the foot, which #886 changes. In select
mode the header button reads **Cancel** as today.

## States

| State | Shows |
|---|---|
| Copying | Copy sheet button `Copying…`, `aria-busy`, chips disabled |
| Copy failed | `role="status"` line above the button: `Couldn't copy. Try again.`; sheet stays |
| Source has nothing | Can't happen from the menu (Copy to… is disabled with `--color-text-secondary` and the sub-line `Nothing to copy yet` on an empty meal) |
| Pull failed | Toast `Couldn't copy yesterday's breakfast. Try again.`; the suggestion stays |

## Edge cases

- A meal holding a recipe entry copies it as a recipe entry.
- A copied group keeps its name; a group from a usual keeps its "Usual" chip (#885).
- Rapid double tap on the suggestion or the button: the second tap is ignored while the first is out.
- The Copy sheet's day list never shows a day after today.
- 375px: chips wrap.

## Copy

`↻ Same as yesterday` · `Same as <weekday>` · `Copied yesterday's breakfast · 4 items` · `Copy to…` ·
`Another day or meal, exactly as it is` · `Select` · `Pick items to save as a usual or a recipe` ·
`Copy from another day…` · `Pick a day's <meal> to bring here` · `Copy <meal>` · `Day` · `Meal` · `Pick a date…` ·
`Copy <n> items to <day>` · `Adds to what's there already; nothing is replaced.` · `Copied <n> items to <day>'s <meal>` ·
`Undo` · `Couldn't copy. Try again.` · `Copying…` · `Nothing to copy yet` · `Couldn't undo. The copied items are still there.`
