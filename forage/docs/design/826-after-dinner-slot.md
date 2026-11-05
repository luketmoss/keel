# 826 — An after-dinner meal slot

Specifies [#826](https://github.com/luketmoss/keel/issues/826), part of epic
[#834](https://github.com/luketmoss/keel/issues/834). The Eaten meal cards, the Add and amount sheets are
[`712-food-log.md`](712-food-log.md); the Plan screen and its meal sheets [`709-meal-plan.md`](709-meal-plan.md); log
mode [`708-recipes-and-cooking.md`](708-recipes-and-cooking.md). None is restated, and their four-slot lists now read
as five. There are no standing documents in `forage/docs/design/`, and nothing here introduces a token.

## The slot

**`After dinner`**, a fifth meal: anything eaten once dinner is over, dessert or not. The stored value and the label are
the same string, as for the other four.

- **Name.** "After dinner" over "Dessert" and "Evening". Dessert would leave a late bowl of cereal in Snacks, which is
  the mix this issue exists to end. Evening is when dinner happens too, so it would not say which side of dinner a thing
  was eaten.
- **Order.** Breakfast, Lunch, Dinner, After dinner, Snacks, everywhere a list of meals appears or sorts. After dinner
  sits next to the meal it is defined by. Snacks keeps its place at the end, so nothing the owner already knows moves.
- **Snacks** now means food eaten between meals during the day. Its name and stored value don't change.

## Where it appears

| Surface | Change |
|---|---|
| Eaten | A fifth meal card between Dinner and Snacks, headed `After dinner`, its Add row reading `Add to after dinner` |
| Amount sheet, Meal chips | Five chips, in the order above. The row already wraps (`.chip-row`), so at 375px the chips take two lines |
| Plan a meal and the meal sheet | The same five chips. The default stays Dinner |
| Plan screen | A meal planned After dinner sorts after Dinner, its line two reading `After dinner` |
| Log mode (cook) | The same five chips. The default by time of day: before 11:00 Breakfast, before 15:00 Lunch, before 21:00 Dinner, **from 21:00 After dinner** (was Snacks) |
| Shop | Trip setup and late meals sort by the new order. Nothing else changes |
| MCP tools | Below |

Every meal card works for After dinner as for the other four: entries, planned rows, Log 1 serving, select mode (#788),
and its status lines: "Logged Greek yogurt", "Logged 2 items to after dinner", "Delete Greek yogurt from After dinner?
Its calories come off today's total."

**Element ids and test ids** built from the slot use a slug with no space: `meal-after-dinner`, never `meal-after dinner`.

## The Forage API and its callers

- `SLOTS` in `apps-script/src/types.js` and `frontend/src/api/types.ts` gain `After dinner` in fourth place. The API
  accepts it on every action that takes a slot (`logFood`, `updateLogEntry`, `upsertPlanEntry`, `movePlanEntry`,
  `planWeek`) and still refuses anything not on the list, with its existing message.
- Reads sort by the new order. `getFoodLogTotals` is unchanged: it has no per-meal figures, and Thrive's Food card
  (#714) reads only the day.
- Nothing migrates. Entries logged under Snacks stay there, after dinner or not, because nothing records which they
  were. The brief's late-eating test counts only days from this release (it is defined that way in the owner's wiki).

## MCP tools

`mcp/src/forage/tools.ts` and `mcp/docs/forage-tools.md`. Every `slot` argument (`forage_log_food`,
`forage_update_log`, `forage_plan_meal`, `forage_move_meal`, `forage_plan_week`) accepts the five values and describes
them as:

> Breakfast, Lunch, Dinner, After dinner (anything eaten once dinner is over) or Snacks (between meals during the day)

`forage_food_log` lists a day's meals in the new order, with `After dinner` and its entries or `(nothing)`, so a day
with nothing after dinner says so. `forage_list_plan` names the slot as stored.

## Demo mode

Unchanged data. The demo day's After dinner card shows only its Add row, and adding to it works as for any meal.

## Edge cases

- **A Forage build older than the API.** The API deploys first (`/ship`), so the old app keeps working against it: an
  After dinner entry made from the MCP sorts last in the old app, and the old app cannot create one.
- **An MCP Worker older than the API**, likewise: it refuses `After dinner` itself until it redeploys.
- **Moving an entry** between After dinner and any other meal keeps its stored numbers, as #712 says for any move.

## Copy

| Where | String |
|---|---|
| Meal card heading, chip, Plan line two | `After dinner` |
| Add row | `Add to after dinner` |
| Toast after a multi-add | `Logged 2 items to after dinner` |
| Delete confirmation | `Delete Greek yogurt from After dinner? Its calories come off today's total.` |
| MCP slot description | as quoted above |
