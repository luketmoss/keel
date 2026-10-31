# 709 — Forage meal plan

Specifies [#709](https://github.com/luketmoss/keel/issues/709). Tokens, spacing, chips, sheets and the tab bar come from
[`suite-language.md`](../../../ui/docs/design/suite-language.md); the shell, the empty state and demo mode from
[`704-app-shell.md`](704-app-shell.md); the "Nutrition" sheet a meal links to from
[`707-food-library.md`](707-food-library.md). Layout reference is the approved prototype
(https://claude.ai/artifact/JYyHpvdbgohjmzZZsN7jY1: `planScreen` and the `addMeal` sheet). Nothing here restates them.
There are no standing documents in `forage/docs/design/` yet.

## Main path

1. Open **Plan**. Header "Plan" in `--text-xl` with a small primary **Plan a meal** button right (the account button
   of #704 stays beside it). Under it: the banner if there is one, then one card holding 8 days.
2. Each day is a header row, the day name in bold (`Today`, `Tomorrow`, then `Wednesday`…) and the short date in
   `--color-text-muted` (`Nov 4`), then its meals, or one ghost row "Nothing planned".
3. A meal row (44px or more, a button): line one the recipe's name; line two `Dinner · 412 kcal a serving`, and a
   "Partial" chip when partial. Right edge, at most one chip: "On list" or "Shopped". Meals are ordered Breakfast,
   Lunch, Dinner, Snacks, then the order they were planned. The slot is in line two, as the prototype has it, not a
   heading of its own: eight days times four headings would bury the day.
4. **Plan a meal** opens the sheet below, picks a recipe, and the meal appears in its day.
5. Tapping a meal opens the **meal sheet** to move or remove it.

The recipes' calories are the API's (`kcal_serving`, #703's nutrition rule). The app never computes them.

## Plan a meal (sheet)

A bottom sheet, title "Plan a meal". In order:

- **Day**: 8 chips in a wrapping group, labels `Today`, `Tomorrow`, then `Wed 5`, `Thu 6`… (the prototype's). Default: the
  day whose ghost row was tapped, else Tomorrow. `aria-pressed` on the chosen chip.
- **Meal**: 4 chips (Breakfast, Lunch, Dinner, Snacks). Default Dinner.
- A two-option switch under them, **Recipe** (default) | **Something else**.
- **Recipe**: a search field "Search recipes" (shown when there are more than 8 recipes) and the list of recipes, each
  row: name, then `★★★★☆ · serves 4` (`Not rated` when unrated; stars are decorative, the text says "4 of 5"
  to a screen reader). Tapping a row plans the meal at once and closes the sheet; there is no Save button. The row that
  was tapped shows a spinner and the list is inert until the call returns.
- **Something else**: a text field "What's the plan?" (placeholder "Eating out, leftovers…", 120 characters), two chips
  that fill it, **Eating out** and **Leftovers**, and a primary **Plan it** button, disabled while the field is blank.

Empty recipe list: "No recipes yet. Import one from Library." with a **Go to Library** link. The recipes come from
`getRecipes`; while it loads the list shows 4 skeleton rows; if it fails: "Couldn't load your recipes." with **Try
again**.

## Meal sheet (move, remove)

A bottom sheet. Title is the recipe's name (or the note's text for a note). Under it, line two `Tuesday, Nov 4 · Dinner`
in `--color-text-secondary`, and for a recipe meal the nutrition line `412 kcal a serving` with "Partial" if so.

- **Day** and **Meal** chips, as above, set to the meal's current values.
- A note meal also has its text field, editable.
- **View recipe** (recipe meals), a link that opens #707's Nutrition sheet for it on top; closing that returns here.
  #708 adds Cook to that sheet.
- **Save**, primary, disabled until the day, slot or note differs from what it was. It calls `movePlanEntry`, and the
  sheet closes.
- **Remove from plan**, a danger text button. It replaces the body with the question
  `Remove Beef Stew from Tuesday's dinner?` and **Remove** (danger fill) and **Keep**. If the meal is on a trip, a
  second sentence: "It's on a shopping trip. Removing it doesn't change the trip." Remove calls `deletePlanEntry`,
  closes the sheet and the row disappears. Keep returns to the sheet.

## Banner

Under the header, when `not_on_trip` is above 0:

> **3 planned meals** aren't on a shopping trip yet.
> (`1 planned meal` isn't on a shopping trip yet.)

`--color-primary-light` background, `--color-text`, `--radius-md`, padding `--space-md`. No button: **Plan a trip** is
#710's, and #710 also swaps the wording when a trip is already open ("was planned after your list was made"). #709
renders the banner as one component taking its text and an optional action, so #710 adds the action without moving
anything. The prototype's "aren't" for one meal is wrong; the singular is above.

What counts: recipe meals dated **after today** (today's meals can't be shopped for), inside the 8 days, with no
`trip_id`. A note is never counted. A meal on an open or a closed trip is on a trip and is not counted. The API
computes it (`not_on_trip`).

## What a trip means here

This issue reads the trip, nothing more. From #703: a meal is **on a trip** when `trip_id` is set; **On list** when
that trip's `status` is `open`; **Shopped** when it is `closed`. #709 never writes `trip_id` and never touches Trips or
TripItems, so moving or removing a meal does not change a list. What a list should do about a plan entry that moved or
is gone (its `lines_json` still names the `plan_id`) is **#710's rule**, and #710 must treat a `plan_id` that no longer
exists as "drop these lines at the next refresh". Cooks keep `plan_id` as history: deleting a plan entry does not touch
them, and #708 reads an unknown `plan_id` as none.

## States

| State | Shows |
|---|---|
| Loading | The header, then 8 day headers with 1 skeleton row each (static under reduced motion). No banner |
| Empty | None of the 8 days has a meal: the #704 empty state, heading "Nothing planned yet", sentence "Meals you plan will show here, by day, with their calories." (the header's **Plan a meal** is the control; no second button). The 8 days are not drawn |
| Populated | As above. Days without meals show the ghost row |
| Error | "Couldn't load your plan." and **Try again**, in `role="status"`. Previously shown meals stay on screen under a refresh failure, with the line above them |
| Offline | The same as Error; the sheets' writes fail with their own line. No queue (#700: no offline sync) |
| Writing | The tapped button is disabled and `aria-busy`; the sheet stays until the call returns |

## Copy

| Where | Text |
|---|---|
| Ghost row | Nothing planned |
| Chip, trip open | On list |
| Chip, trip closed | Shopped |
| Chip, partial | Partial |
| No calories | `Dinner · no calories yet` |
| Write failed (any sheet) | Couldn't save that. Try again. (`role="status"`, under the buttons, always in the DOM) |
| Recipe gone | That recipe isn't in your library any more. (then the list reloads) |
| Meal gone (move) | That meal was already removed. (the sheet closes and the plan reloads) |
| Remove, done | the row simply disappears; no toast |

## Edge cases

- **Rapid repeat**: every create sends its own `id` (`pl_` + 8 hex, made when the sheet opens), so a double tap, or a
  retry after a timeout, leaves one row (#703). The tapped recipe row and **Save** are disabled while a call is out.
- **Same recipe, same slot, same day**: the app allows it (no `id`-less duplicate check applies, since it sends an `id`);
  an agent without an `id` gets `duplicate_of`.
- **Moving to where it already is**: Save stays disabled, so nothing is sent.
- **Device date**: dates are plain `YYYY-MM-DD`; the app asks for its device's local today to
  today + 7 and sends `today` so the banner uses it. The API's default is America/Denver (#703).
- **Entry deleted elsewhere while its sheet is open**: Save answers "That meal was already removed."
- **Recipe renamed**: rows show the name the API returns, so they follow it. A recipe with a plan entry can't be
  deleted (#703's refusal lists the plan entries), so a row never points at nothing.
- **Many meals in a day**: the card grows; there is no limit. A day of 10 meals scrolls with the page.
- **Midnight with the tab open**: the next load or a return to the tab recomputes the 8 days. The window does not move
  by itself.
- **Long names**: wrap to two lines inside the row; the chip stays on the right and the name wraps around it.
- **Rated, unrated and partial** are text as well as a chip or stars, never colour alone.

## Accessibility and layout

- 375px: no horizontal scroll; the chip group wraps (8 day chips are 2 rows). Every row, chip and button is at least
  44px, including **Keep** and **Remove**.
- The day headers are `<h2>`; each day's meals are a list; a meal is a button whose accessible name is
  `Beef Stew, Dinner, 412 kcal a serving, on list`.
- Sheets trap focus, restore it to the opener, close on Escape, and are `role="dialog"` with the title as the name.
- The banner is a plain region, not a live region: it changes with the user's own action.
- Reduced motion: sheets appear without sliding.

## Demo mode

Per #704. The plan starts with 6 sample meals relative to today, using #707's demo recipes and two more: tomorrow
dinner "Weeknight chili" (on list), today lunch "Leftovers" (note), +1 breakfast "Overnight oats" (shopped, from an
earlier trip), +3 dinner a partial recipe, +3 lunch a second meal in another slot, +5 dinner a plain recipe. Planning,
moving and removing change the in-memory plan and show in the banner count. Nothing is saved.

## MCP tools (registered by this issue, in `mcp/src/forage/tools.ts`)

Per #713's rule each feature issue registers its tools. (#707's note says its tools are "registered by #713, not
#707"; the two disagree, and this issue follows #713's own note: the PR of the feature that adds the action adds its
tool.) All go through the Forage API. `forage_list_plan` is in `FORAGE_READ_TOOLS`; the other four are write tools and end
with the connector's reminder when they write. In all of them `date` is `YYYY-MM-DD`, or `today` / `tomorrow` / `+3d`
as Thrive's tools take them, in America/Denver.

| Tool | Inputs | Calls | Result |
|---|---|---|---|
| `forage_list_plan` (read) | `from`, `to` (default today to today + 7) | `getPlan` | The entries by day, below |
| `forage_plan_meal` (write) | `date`, `slot`, one of `recipe_id` / `note`, `id` (optional, makes a retry safe), `allow_duplicate` (default false) | `upsertPlanEntry` | The planned entry, or `duplicate_of` |
| `forage_move_meal` (write) | `id`, at least one of `date` / `slot` / `note` | `movePlanEntry` | The entry as moved |
| `forage_remove_meal` (write) | `id` | `deletePlanEntry` | Confirmation. `forage_undo` brings it back |
| `forage_plan_week` (write) | `entries` (1 to 28: `date`, `slot`, `recipe_id` or `note`, optional `id`), `dry_run` (default true), `allow_duplicate` | `planWeek` | The preview, or the saved entries |

`forage_plan_week` defaults to a dry run because it writes many rows from a plan an agent just composed, and the
preview checks every recipe exists before anything is written. It only adds: nothing in the range is removed or
replaced.

**`forage_list_plan` result** (no reminder):

```
Plan Tue 2026-11-04 to Tue 2026-11-11. 3 planned meals aren't on a shopping trip yet.

Today · Tue 2026-11-04
  pl_1a2b3c4d  Lunch   Leftovers (note)
Tomorrow · Wed 2026-11-05
  pl_5d6e7f8a  Dinner  Weeknight chili (rc_9e8f7a6b) · 412 kcal a serving · on list
Thu 2026-11-06
  Nothing planned
```

`kcal a serving` is `no calories yet` when unknown and gets `, partial` when partial; `on list` or `shopped` ends a line
when the meal is on a trip. An empty range: `Nothing planned from 2026-11-04 to 2026-11-11.`

**`forage_plan_meal`, saved** (reminder follows):

```
Planned Weeknight chili for Wed 2026-11-05, Dinner (pl_5d6e7f8a).
Undo with forage_undo, call 7c1e…
```

Duplicate (no reminder, nothing written): `Already planned: Weeknight chili on Wed 2026-11-05, Dinner (pl_5d6e7f8a). Pass allow_duplicate: true to add another.`

**`forage_move_meal`, saved** (reminder follows): `Moved Weeknight chili from Wed 2026-11-05, Dinner to Thu 2026-11-06, Dinner (pl_5d6e7f8a).`
Unknown id (no reminder): `Nothing changed. No meal pl_5d6e7f8a in the plan.`

**`forage_remove_meal`, saved** (reminder follows): `Removed Weeknight chili from Wed 2026-11-05, Dinner (pl_5d6e7f8a). It was on a shopping trip; the trip is unchanged.`
(the second sentence only when it was). Unknown id: `Nothing changed. No meal pl_5d6e7f8a in the plan.`

**`forage_plan_week`, dry run** (no reminder):

```
Preview — nothing saved.
6 meals: 5 new, 1 already planned (skipped).
Wed 2026-11-05  Dinner  Weeknight chili · 412 kcal a serving
Thu 2026-11-06  Dinner  Eating out (note)
Fri 2026-11-07  Dinner  Beef Stew · 388 kcal a serving, partial
Sat 2026-11-08  Lunch   Beef Stew — already planned there, skipped
…
Call again with dry_run: false to save them.
```

Saved: `Planned 5 meals, skipped 1 already planned.` then `Undo with forage_undo, call …` and the reminder. Refused: `Nothing
saved. Entry 3 (2026-02-30): not a real date.` naming every entry that failed, one per line. Over 28:
`Nothing saved. 31 entries is over the limit of 28.`

Other refusals pass the API's fixed text after `Nothing saved.` / `Nothing changed.`; a tool error never shows the API
key or URL.

**Undo** is #713's (`undoCall`): adding is undone by deleting the entry, a move by restoring the prior row, a removal by
recreating it with its id. An added entry that has since joined a trip or been cooked is **not** removed by an undo; the
call is refused naming it, by #713's stricter referential check.

**Tool descriptions** (what an agent reads): `forage_plan_meal`: "Plans a recipe or a note (eating out, leftovers) for a
day and slot. Slots are Breakfast, Lunch, Dinner, Snacks. Several meals can share a day. Pass id to make a retry safe."
`forage_move_meal`: "Changes a planned meal's day, slot or note. It does not change a shopping trip." `forage_plan_week`:
"Plans several meals at once. Previews first; only adds, never removes or replaces."

**Docs row** for `mcp/docs/forage-tools.md`, and the five `PENDING_TOOLS` entries removed, as #713 requires.

## API shape

`getPlan` (`from`, `to`, optional `today`) answers:

```json
{
  "entries": [{
    "id": "pl_5d6e7f8a", "date": "2026-11-05", "slot": "Dinner",
    "recipe_id": "rc_9e8f7a6b", "recipe_name": "Weeknight chili", "servings": 6, "note": "",
    "kcal_serving": 412, "partial": false,
    "trip_id": "tr_01020304", "trip_status": "open", "on_trip": true, "shopped": false,
    "created": "…", "updated": "…"
  }],
  "not_on_trip": 3
}
```

`recipe_name`, `servings`, `kcal_serving`, `partial`, `trip_status`, `on_trip` and `shopped` are derived on read and never
stored. `kcal_serving` is `null` when nothing could be counted (blank means unknown, never 0), and is rounded to a whole
number for display only by the app. Writes answer with the entry in this same shape. `movePlanEntry` takes the fields it
changes and leaves the rest. `duplicate_of` answers with the existing entry and `written: false`.

## Measured

Nothing is measurable yet: there is no running Forage app. The 375px and 44px criteria are checked at `/test` with
`getBoundingClientRect()`, per `stack-web`. The beef stew calorie figure is #703's fixture.

## New tokens

None.
