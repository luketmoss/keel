# Forage tools

Reference for the `forage_*` tools served at `/forage/mcp` (read) and `/forage/write/mcp` (write), #713. Every Forage
tool is added to the table below by the issue that registers it. The tool descriptions in `src/forage/tools.ts` are what
an agent actually sees, and are the source of truth; the wording of their results is fixed by
[`docs/design/713-forage-connectors.md`](design/713-forage-connectors.md).

## How it works

The tools are a **thin client of the Forage Apps Script API** (`forage/apps-script/`, #703), called with the Worker's
`FORAGE_API_KEY`. They hold no row mapping and never touch the sheet: `src/forage/api.ts` is the only file that talks to
the outside world. Recipe parsing, ingredient matching and nutrition are all the API's (#706, `importer.js` and
`nutrition.js`), so the app and an agent cannot disagree about what a line means. **A change to `forage/apps-script/` that
alters a response shape needs a matching change here.**

Every request is a form-encoded POST: the key and the payload stay out of the URL. Writes are sent once and never
retried, carry the tool call's `call_id` so the API logs their rows for `forage_undo`, and count against the write limits
(`mcp/CLAUDE.md`, "Write limits"). Reads and dry runs carry no `call_id` and are never counted.

## Tools

| Tool | Endpoint | Calls | Description |
|------|----------|-------|-------------|
| `forage_status` | read | `getConfig` | Whether the API answers, and its schema version |
| `forage_import_recipe` | write | `importRecipe` | Import from exactly one of `url`, `jsonld`, `text` or `recipe` (structured, e.g. from a photo). A dry run by default (`dry_run` true): the recipe as read, each line's match or suggestions, nutrition per serving. `dry_run: false` saves it, unmatched lines as unmatched; `allow_duplicate` saves a link already in Forage. Over `MAX_ROWS_PER_CALL` rows (recipe + lines + steps) it previews until `confirm: true` |
| `forage_search_foods` | read | `getFoods`, `getStarterFoods` | Foods by `q`, `kind`, `regular`, `barcode`, up to `limit` (20): compact rows (`id, name, brand, kind`, the four per-100 g values and #755's seven, `has_nutrition, verified, source`), as JSON. `include_starter` adds the starter list's matches with `starter_id`, `in_library` and `can_fill` (#707) |
| `forage_get_food` | read | `getFood` | One food, whole: weights, shopping fields, source, `verified` and `used_by` (#707) |
| `forage_add_food` | write | `lookupBarcode`, `addStarterFoods`, `upsertFood` | Exactly one of `barcode` (Open Food Facts, a read; the food's servings are the label serving first, e.g. `0.75 cup` at 56 g, plus one unit, `cup` at 74.7 g, when the label's quantity isn't 1 (#775)), `starter_id`, `food` (the form's fields: `per_serving` with `serving`, or `per_100g`, each `{kcal, protein, carbs, fat}` and optionally `satfat`, `transfat`, `cholesterol_mg`, `sodium_mg`, `fiber`, `sugars`, `added_sugars` (#755), the API's refusals passed back; `source` `usda` needs `source_ref`, `off` only through `barcode`) or `foods` (up to 20, one `upsertFood` each under the call's one `call_id`: one write, its rows counted, one `forage_undo`). A dry run by default; `verified` only when the owner checked the label (#707) |
| `forage_update_food` | write | `upsertFood`, `setFoodWeight` | `id` plus the fields to change; `weights` sets or replaces each named weight it lists (#707) |
| `forage_delete_food` | write | `deleteFood` | Refused while a recipe or trip uses the food, naming the recipes. `destructiveHint` (#707) |
| `forage_search_recipes` | read | `getRecipes` | Recipes by `q` (a word in the name, an ingredient line, or a matched food's name, ignoring case) and `sort` (`newest` default, `name`, `rating`, `last_cooked`), up to `limit` (20): compact rows (`id, name, source_site, servings, rating, last_cooked, cook_count, kcal_per_serving, partial, has_walkthrough`, and `matched_line` when the match was not the name), as JSON (#708) |
| `forage_get_recipe` | read | `getRecipe`, `getCooks`, `getFoods` | One recipe: lines verbatim with `line_id`, section, food and weight; steps; nutrition per serving and `missing`; rating, last cooked, `has_walkthrough`; the last 5 cooks (#708); `walkthrough` and `walkthrough_check` (`{ok, problems}`, checked against the lines as they are now), then `Walkthrough needs an update: <problems>` when it is stale (#711) |
| `forage_set_walkthrough` | write | `setWalkthrough` | Saves `walkthrough` (format 1, whose reference is the input's description) for `recipe_id`, replacing any. Refused, saving nothing, with every problem the validator finds (at most 20, then `and N more`), each naming the step, prep group or line; warnings are saved and listed. Answers the summary: prep groups, tasks, cook steps, minutes timed and waited (#711) |
| `forage_delete_walkthrough` | write | `deleteWalkthrough` | Deletes the recipe's walkthrough; the recipe stays and cooks in log mode. `destructiveHint` (#711) |
| `forage_cook_history` | read | `getCooks` | Cooks newest first, for one `recipe_id` or every recipe, on or after `since`, up to `limit` (20): `id, recipe_id, recipe_name, date, rating, note, plan_id` (#708) |
| `forage_update_recipe` | write | `getRecipe`, `upsertRecipe` | `id` plus any of `name`, `servings`, `total_min`, `notes`, `source_url`; `lines` patches by `line_id` (`text`, `food_id`, `grams`, `optional`), the rest kept with their ids; `steps` replaces every step (#708) |
| `forage_log_cook` | write | `upsertCook` | Records a cook: `recipe_id`, `date` (default today), `note`, `rating`, `plan_id`; an `id` of the caller's own makes a retry leave one cook. Eating is logged separately (#708) |
| `forage_rate_cook` | write | `getCooks`, `getRecipe`, `upsertCook` | `rating` 1 to 5, or null to clear, and `note`, on `cook_id` or the latest cook of `recipe_id`; a recipe never cooked is refused. For after the owner says they ate it (#708) |
| `forage_delete_recipe` | write | `deleteRecipe` | Deletes the recipe with its lines, steps, walkthrough and cooks; refused while a plan or log entry uses it, naming them. `destructiveHint`. Added for parity: the app's Library deletes a recipe (#708) |
| `forage_list_plan` | read | `getPlan` | The plan by day from `from` to `to` (default today to today + 7, America/Denver; YYYY-MM-DD, `today`, `tomorrow`, `+3d`): each meal's id, slot, recipe or note, kcal a serving (`, partial`, or `no calories yet`), `on list` / `shopped`, and the count of planned meals not on a trip (#709) |
| `forage_plan_meal` | write | `planWeek` (dry run), `upsertPlanEntry` | Plans a recipe or a note for a `date` and `slot`; `id` makes a retry safe. Without an `id`, the same recipe in the same day and slot is refused as already planned (no write, not counted) unless `allow_duplicate` (#709) |
| `forage_move_meal` | write | `getPlan`, `movePlanEntry` | Changes a meal's `date`, `slot` or `note`; an unknown id is refused before any write. Never changes a trip (#709) |
| `forage_remove_meal` | write | `getPlan`, `deletePlanEntry` | Removes a meal, saying when it was on a trip (which is unchanged); `forage_undo` brings it back (#709) |
| `forage_plan_week` | write | `planWeek` | Up to 28 `entries`, all or nothing. A dry run by default (`dry_run` true): each meal with its calories and what it would skip as already planned. `dry_run: false` saves; only adds (#709) |
| `forage_get_trip` | read | `getTrip`, `getTrips` | The open trip (or `trip_id`): its meals, then each item by To sort, store and Have it, with `food_id`, the need the API derives, its recipes, `added by you`, its buying amount, `suggested` and `bought`; the lines not matched to a food; the meals planned since the list was made. No open trip: the last closed one (#718, #719) |
| `forage_start_trip` | write | `startTrip` | A trip `through` a date (YYYY-MM-DD, `today`, `tomorrow`, `+5d`) for `plan_ids` (default every recipe meal after today through it). A dry run by default (`dry_run` true): the meals, how many items start as Have it, at a usual store or to sort, and the unmatched lines. Refused, naming each meal, for a note, a meal today or earlier, after `through` or on a trip; and while a trip is open (#718) |
| `forage_set_trip_item` | write | `setTripItem` | `food_id` and `choice` (`have`, `ks`, `costco`, `other`), `bought` or `buy`, on the open trip or `trip_id`. A store that differs from the food's usual store becomes it; only an item with a store can be bought (#718). `buy` is the buying amount as free text, up to 60 characters; empty clears it (#719) |
| `forage_add_to_trip` | write | `addToTrip` | Exactly one of `food_id`, `text` (the food with that name, ignoring case, or a new name-only food) or `late_meals: true` (the recipe meals planned after the list was made, through its date; `today` default today). An added food gets its usual store and last bought amount; one already on the list changes nothing. Late meals join the trip and grow the items already there, keeping their choice and tick. Undo removes the item (and a food it created), or clears the meals' trip; refused once the item has been sorted, bought or given a buying amount (#719) |
| `forage_remove_from_trip` | write | `removeTripItem` | Takes an item added by hand, with no meals, off the open trip (or `trip_id`); the food stays. An item planned meals need is refused, naming how many. Added for parity: the app takes an added item off the list (#719) |
| `forage_close_trip` | write | `closeTrip` | Closes the open trip (or `trip_id`): what was bought and what wasn't; its meals then read as shopped (#718). Each bought item with a store and a buying amount writes that amount to its food's `last_buy`, with the date, in the same call, so `forage_undo` restores them (#719) |
| `forage_discard_trip` | write | `getTrip`, `discardTrip` | Throws the open trip (or `trip_id`) away: its items go and its meals stay planned with no trip. A preview until `confirm: true`; a closed trip is refused. `destructiveHint`. Added for parity: the app throws a list away (#718) |
| `forage_food_log` | read | `getFoodLog`, `getFoodLogTotals`, `getFoods`, `getRecipes` | A `date` or `from` and `to` (default today, America/Denver; at most 31 days): each day's line from `getFoodLogTotals` (kcal, `so far` only today, `low:` naming the entries with no nutrition and the partial ones, whole-gram macros; `nothing logged` for a date absent from the totals), then each meal in order (Breakfast, Lunch, Dinner, After dinner, Snacks) with its entries (id, food or recipe, amount and kcal: `(partial)`, `no nutrition`) or `(nothing)` (#826). The day and each entry get a second line listing only #755's values that are known (`Sat fat 3 g · Sodium 640 mg · Fiber 8 g · Sugars 12 g`), absent when none is; a food's and a recipe's nutrition text in the other tools does the same. Adds nothing up (#712) |
| `forage_log_food` | write | `logFood` | Exactly one of `food_id` and `recipe_id`, `qty`, `unit` (a serving name or `g`; recipes `serving`), `slot` (Breakfast, Lunch, Dinner, After dinner for anything eaten once dinner is over, or Snacks for between meals during the day; #826), `date` (default today). A dry run by default (`dry_run` true, `logFood`'s own `dry_run`): the entry and its macros as Forage would store them. `dry_run: false` logs it and answers its id. A food with no nutrition is logged as unknown. No `id`: a lost answer is checked with `forage_food_log`, not retried (#712) |
| `forage_update_log` | write | `getFoodLog`, `updateLogEntry` | `id` and any of `qty`, `unit`, `slot`; an unknown id is refused before any write. A dry run by default: before and after. A new amount or unit recalculates from the food as it is now; a slot change keeps the stored numbers (#712) |
| `forage_delete_log` | write | `getFoodLog`, `deleteLogEntry` | Deletes an entry, naming it; an unknown id is refused before any write. `forage_undo` brings it back with its stored numbers. `destructiveHint` (#712) |
| `forage_undo` | write | `getChangeLog`, `undoCall` | No arguments: the last 20 calls. `call_id`: a dry run listing every row it would restore, remove or recreate. `confirm: true`: reverts, all or nothing. Refused when a row changed since, or when a row it would remove is now used elsewhere. `destructiveHint` |

## Adding a tool

A Forage feature issue (#707 foods, #708 recipes and cooks, #709 plan, #710 trips, #711 walkthroughs, #712 food log)
that registers a tool, in the same PR:

1. Registers it in `src/forage/tools.ts`, and adds it to `FORAGE_READ_TOOLS` if it only reads. Anything not in that set
   is served on the write endpoint.
2. Removes the actions it calls from `PENDING_TOOLS` in `forage/apps-script/tests/mcp-parity.test.ts`, which fails while
   an action with a tool is still pending, or an action has neither.
3. Checks that its write actions are in `CHANGE_LOGGED_ACTIONS` (`forage/apps-script/src/change-log.js`) with every tab
   they can change, so `forage_undo` can revert them.
4. Adds a row to the table above.

The PR changes `mcp/`, and merges unattended (#745). `/review` blocks it if it
puts a write tool in `FORAGE_READ_TOOLS`, or drops a destructive one from
`mcp/CLAUDE.md` §Approving the destructive tools, unless an acceptance criterion
asks for exactly that.
