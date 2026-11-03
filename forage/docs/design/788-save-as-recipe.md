# 788 — Save logged items from a meal as a recipe

Specifies [#788](https://github.com/luketmoss/keel/issues/788). Tokens, spacing and touch targets come from
[`suite-language.md`](../../../ui/docs/design/suite-language.md); the Eaten day view, meal cards, Add sheet and Amount
sheet from [`712-food-log.md`](712-food-log.md); the toggle row with a check box from the shop list in
[`718-shopping-trips.md`](718-shopping-trips.md); bottom sheets and the status line from
[`706-recipe-import.md`](706-recipe-import.md); the "patch, close and toast together" rule from
[`785-instant-saves.md`](785-instant-saves.md). None is restated. There are no standing documents in
`forage/docs/design/`. The layout reference is the clickable mock (https://claude.ai/artifact/2BCZwVoT4yrAafHRKTneSM).
Every length is a token; nothing here introduces one.

## Main path

1. In Eaten, the Dinner card holds Chicken breast, Spring mix, Red onion, Cherry tomatoes, a vinaigrette, Crispy
   onions and Garlic bread (a recipe). Its header shows **Select** at the right.
2. Tap **Select**. Dinner enters select mode: every food entry is a toggle row with an empty check box; Garlic bread is
   dimmed and can't be ticked; the planned rows and the Add row are gone; the header button reads **Cancel**; a primary
   full-width button **Save as a recipe** sits at the foot of the card, disabled, with "Tick the items that go
   together." under it in `--color-text-secondary`.
3. Tick the five salad items. The button reads **Save 5 as a recipe** and is enabled; the helper line goes.
4. Tap it. The **New recipe** sheet opens (below).
5. Type "Side salad", leave Serves at 1, tap **Save recipe**. The sheet closes, Dinner leaves select mode, and the toast
   says `Saved Side salad to your recipes`, in one update. The day's entries and the day card are exactly as before.
6. Later, **Add to lunch**, type "side": `Side salad · Recipe · 191 kcal a serving`. It logs like any recipe
   (#712's Amount sheet, `servings`, default 1).

## Meal card in select mode

- **Select** is a text button (`--color-primary`, 44px or more) in the meal card's header row, right-aligned with the
  heading. It shows when the meal holds at least one entry for a food that still exists. It is hidden while the day is
  loading or failed.
- Only one meal is in select mode. **Select** on another meal moves select mode there and drops the first meal's ticks.
- **Food entry, select mode:** #718's toggle row: a button with `aria-pressed`, a 22px check box at the left (empty;
  ticked: `--color-primary` fill with a tick in `--color-on-primary`), then the two lines exactly as #712's entry row
  (name, amount), then the calories. The tick is a shape, not colour alone. Tapping toggles; it never opens the Amount
  sheet. Accessible name: `Spring mix, 2 cup · 85 g` plus the pressed state.
- **Recipe entry, select mode:** the same row with `aria-disabled="true"`, a dashed check box and its text at half
  opacity (the text stays readable at `--color-text-secondary`). Line two becomes `1 serving · Recipes can't go in a
  recipe`. Tapping does nothing. A removed food's entry (`A removed food`) is the same, with line two
  `<amount> · This food was deleted`.
- **An entry with no nutrition** is selectable like any food, and keeps its `—` chip.
- **Foot:** **Save as a recipe** (disabled, none ticked) / **Save 1 as a recipe** / **Save 5 as a recipe**, primary,
  full width, `--space-md` above it.
- **Leaving select mode** with nothing saved: **Cancel**, the day arrows, another tab, or the app going to the
  background and loading the day again. No confirmation; ticks are cheap.

Nothing starts ticked. A meal usually holds more than the one combination (the salad came with chicken and bread), so
"untick what doesn't belong" would be the slower path more often than not.

## New recipe sheet

A bottom sheet, title `New recipe`, a **Cancel** text button in its header. Top to bottom:

1. **Name.** Label `Name`, a text field, empty, placeholder `Side salad`, focused on open, `autocomplete="off"`,
   at most 120 characters.
2. **Serves.** Label `Serves`, a stepper (44px minus and plus, the number between in `--text-lg` bold), default 1,
   1 to 99; minus is disabled at 1, plus at 99. Above 1, a line under it in `--color-text-secondary`: `The amounts below
   make all 2 servings.`
3. **Ingredients (5).** One hairline row per ticked entry in the order logged: left, the line text the recipe will
   store (`2 cup Spring mix`); right, in `--color-text-secondary` with tabular figures, the grams (`85 g`) or
   `No nutrition`.
4. **A serving.** #712's numbers card: label `A serving`, the calories in `--text-xl` bold, then
   `Protein 2 g · Carbs 12 g · Fat 5 g`. From `computeNutrition` with the lines and Serves, requested on open and 400ms
   after each Serves change; while it is out the old figures stay and the label reads `Updating…` in `role="status"`.
   Partial: `about 175 kcal · partial`, and the line `Some ingredients have no nutrition, so this is low.` Every line
   without nutrition: `—` and that line. Preview failed: `Couldn't work out the calories.`; Save stays enabled.
5. A line in `--color-text-secondary`: `Saved from Dinner on Mon 2 Nov 2026. Your log stays as it is.`
6. **Save recipe**, primary, full width. Disabled while the name is blank (spaces only counts as blank) and while
   saving; while saving it reads `Saving…` with `aria-busy`.

| State | Shows |
|---|---|
| Saving | Button `Saving…`, disabled, `aria-busy`; name and stepper disabled |
| Saved | Sheet gone, select mode off, toast `Saved Side salad to your recipes` |
| Save failed | `role="status"` above the button in `--color-danger-text`: `Couldn't save. Your changes are kept here. Try again.` The sheet stays, with the name and Serves as typed, and select mode keeps its ticks |
| A ticked food deleted meanwhile | The API's refusal text, as #712's Amount sheet shows it |

Cancel, Escape or the scrim close the sheet and return to select mode with the ticks kept.

## What is saved

One `upsertRecipe` call with no `id`; the app sends its own `rc_` id, fixed per sheet open, so a retry after a lost
answer leaves one recipe.

- `name`: as typed, trimmed. `servings`: Serves. `notes`: `Saved from Dinner on Mon 2 Nov 2026.` (the slot, then the
  day as `ddd D MMM YYYY`). No `source_url`, `source_site`, `total_min` or steps.
- `lines`, one per ticked entry in the order logged: `food_id` the entry's food; `qty` and `unit` as the entry has them
  (`unit` a serving name or `g`); `grams` the entry's resolved grams, so conversion never runs and Serves 1 equals the
  entries' calories; `text` the amount then the food's display name (brand then name): `2 cup Spring mix`,
  `150 g Chicken breast, grilled`, `2 tbsp Brianna's Blush wine vinaigrette`. No sections, none optional.

After saving, the new recipe goes into the Library's and the Add sheet's recipe lists from the reply (#785), so it is
searchable without a reload. The recipe sheet shows it as any recipe without steps (#708: no Steps row, "No walkthrough
yet…", the Ingredients table), with no site label in its title block.

## Edge cases

- **One item.** Allowed: **Save 1 as a recipe**. A recipe of one food at a fixed amount is a real use (a usual bowl of
  cereal), and a minimum of two would be a rule to explain.
- **The same food twice in the meal.** Two lines, as logged.
- **Duplicate name.** Saved; two recipes may share a name, as two imports can.
- **An entry edited while ticked.** Not possible: rows don't open in select mode.
- **Past days.** Select works on any day the arrows reach; `notes` names that day.
- **Rapid taps** on Save recipe: disabled from the first tap.
- **Offline:** the save fails with the line above; nothing queues.
- **375px:** the line texts wrap; the grams column never wraps; no horizontal scroll.

## Accessibility

- Select, Cancel, the toggle rows, the stepper buttons and every button in the sheet are 44px or more.
- Select mode announces nothing extra: the header button's name changes to `Cancel`, and each row's pressed state is
  read. The foot button's name carries the count.
- The sheet traps focus, starts on Name, closes on Escape and returns focus to the foot button.
- The toast is #712's `role="status"`.
- Reduced motion: the sheet appears without sliding.

## Demo mode

Dinner today gains the salad: Spring mix (2 cup · 85 g), Red onion (20 g), Cherry tomatoes (0.5 cup · 75 g), a
vinaigrette (2 tbsp · 30 g), Crispy onions (2 tbsp · 7 g), Homemade croutons (15 g, no nutrition), beside the existing
planned Beef Stew. `demo-api.ts` answers `computeNutrition` and `upsertRecipe` from the demo foods; the saved recipe lives
in memory until reload.

## Measured

Nothing new is measured: every size here is an existing token or #712's row and button heights. `/test` checks the
44px and 375px criteria with `getBoundingClientRect()` per `stack-web`.

## New tokens

None.
