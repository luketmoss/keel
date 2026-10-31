# 718 — Forage shopping trips A: build, sort and shop

Specifies [#718](https://github.com/luketmoss/keel/issues/718), the first half of #710. Tokens, spacing, chips, sheets
and the tab bar come from [`suite-language.md`](../../../ui/docs/design/suite-language.md); the shell, empty states and
demo mode from [`704-app-shell.md`](704-app-shell.md); store chips and the "usually have" switch from
[`707-food-library.md`](707-food-library.md); the Plan banner and the On list / Shopped chips from
[`709-meal-plan.md`](709-meal-plan.md). Layout reference is the approved prototype
(https://claude.ai/artifact/JYyHpvdbgohjmzZZsN7jY1: `shopScreen`, `sortItem`, the `tripSetup`, `tripMenu` and `done`
sheets). Nothing here restates them. There are no standing documents in `forage/docs/design/` yet.

The trip rules (eligible meals, building, stale lines, the amount, defaults) are in the issue body and are not repeated
here. #719 extends this note's screens: where it adds something, this note says "#719".

## Main path

1. **Shop, no open trip.** Header "Shop". One card: a row with "No trip in progress" and the sentence below, then a
   full-width primary **Plan a trip**. Under the card, in `--color-text-muted`, the "Last trip" line when a trip has
   ever closed.
2. **Plan a trip** (here, or the button #709's banner gains) opens the **trip setup sheet**.
3. **Build the list** calls `startTrip` and, on success, closes the sheet, switches to the Shop tab (`#/shop`) at the top,
   in **Sort**.
4. **Sort.** Each item gets one of four choices. When nothing is unsorted, **Make lists: N to buy** switches to **Shop
   mode**.
5. **Shop mode.** Pick a store tab, tick items as they go in the basket. **Done shopping** opens the done sheet;
   **Close the trip** closes it, switches to Plan, and shows the toast. The trip's meals now say "Shopped".

## Trip setup (sheet)

A bottom sheet, title "Plan a trip". In order:

- **Shop for meals through**: 3 chips, today + 3, + 5 and + 7, labelled `Fri 7` (short weekday and day of month, the
  prototype's). Default + 5. `aria-pressed` on the chosen chip.
- **Meals on this trip**: a list of the eligible meals up to that date (issue body), by date then slot. Each row is a
  toggle button (`aria-pressed`): a check box, the recipe's name, and `Wed Nov 5 · Dinner` in
  `--color-text-secondary`. All start ticked. A tick survives a date change: a meal unticked at + 7 is still unticked
  after going to + 5 and back. None in range: one row "No planned meals in these dates".
- The **count line** (`--color-text-secondary`): `12 ingredients, combined where meals share them. Things you usually
  have start as "Have it".` (`1 ingredient, …`; `No ingredients.` at 0). When the dry run has `unmatched`, a second
  line: `2 ingredients aren't matched to a food yet, so they won't be on the list.` (`1 ingredient isn't …`)
- The primary button: **Build the list**, or **Start a list with no meals** when nothing is ticked (or nothing is in
  range).

The count comes from `startTrip` with `dry_run: true` and the ticked `plan_ids`, sent when the sheet opens and 300 ms
after the last change; an older answer arriving after a newer request is ignored. While it is out the count line reads
`Counting…`; if it fails, `Couldn't count the ingredients.` and the build button still works. The sheet makes its trip
`id` (`tr_` + 8 hex) when it opens and sends it with the real call, so a double tap or a retry builds one trip.

While building, the button is disabled, `aria-busy`, and reads `Building…`. A refusal (a meal was removed or joined a
trip elsewhere in the meantime) shows the API's text under the button and reloads the meal list; the sheet stays.

## Sort

Header "Shop", sub-line `2 meals · through Fri Nov 7` (`1 meal`; `No meals` for an empty trip), and on the right a small
**Trip** button that opens the trip menu. (#719 adds **Add** beside it.)

1. **Progress card**: bold `Do you have it, or where will you get it?`; a progress bar (`aria-hidden`, fill
   `--color-primary` on `--color-border-light`, `--radius-md`) at sorted ÷ all; and the counts line
   `5 of 12 sorted · 3 have · 1 King Soopers · 1 Costco · 0 other` (tabular figures).
2. **Filter**: a two-button segmented control, `role="group"` `aria-label="Show"`: **To sort (7)** | **Everything
   (12)**. On entering Sort it is To sort when any item is unsorted, else Everything.
3. **Groups**: a card per food `category`, its name as the card's label, categories in alphabetical order with foods
   with no category last under **Everything else**; inside, items by name.
4. **An item**:
   - Line one: the food's name (#707's display name, brand first for packaged); on the right, bold, the API's `need`
     (`about 6 onions`), or nothing when it has none. (#719 turns this into the buying-amount button.)
   - The breakdown: with one line, a muted line `Beef Stew · Fri: 2 lb beef chuck, cubed` (recipe, short weekday,
     the line's text as the source wrote it). With several, a text button **Show 2 meals** (`aria-expanded`) that
     reveals one such line per meal and becomes **Hide 2 meals**.
   - The choices: four equal buttons in a `role="group"` labelled by the food's name: **Have it**, **King Soopers**
     (wrapping to two lines, as the prototype's `CH_SHORT`), **Costco**, **Other**. The chosen one is `aria-pressed`
     with the selected-chip fill (`--color-primary-light`, `--color-primary` border and text).
   - The why line, muted, at most one:
     - suggested Have it: `Suggested: you usually have this`
     - suggested store: `Suggested: you usually get this at Costco`
     - right after a pick that answered `remembered`: `Forage will suggest King Soopers next time` (until Shop is
       left or reloaded)
5. **Picking a choice** sets it at once (optimistic) and calls `setTripItem`. In **To sort**, a just-picked item stays
   where it is until the filter is changed or Shop is left, so the list doesn't jump under the thumb. Counts and the
   progress bar update at once.
6. **Footer**, sticky above the tab bar: the primary button. Unsorted items: disabled, `Sort 3 more to make your
   lists`. Otherwise `Make lists: 9 to buy`.
7. **Unmatched**, when `unmatched` is non-empty: a last card, label **Not on the list**, sentence `These aren't matched
   to a food yet. Match them in the recipe and they'll be on your next trip.`, then one muted line per line:
   `1 bay leaf · Beef Stew`. No button (matching is #706/#707's chooser in Library).

**To sort, nothing left**: in place of the groups, one card: `Everything is sorted` and `Suggestions came from your
foods' usual stores and pantry. Check them under Everything, or make your lists.`

**A trip with no items** (no meals, or nothing shoppable): one card, `Nothing on this list.` and `This trip has no
ingredients to sort.` The footer reads `Make lists: 0 to buy` and is enabled. (#719 changes this sentence to point at
**Add**.)

## Shop mode

Same header. Then:

- **Store tabs**: a segmented `role="group"` `aria-label="Store"`, one button per store with at least one item, in the
  order King Soopers, Costco, Other: `King Soopers 3/8` (bought/total, tabular). The first is selected on entering;
  the selection is kept while the trip is open (below).
- **The store's items**: one card. A row per item is a toggle button (`aria-pressed` = bought): a check box, the name,
  and the sub-line `about 6 onions · Beef Stew, Weeknight chili` (need, then the distinct recipe names; just the
  names when there is no need). On the right, the category in `--color-text-muted`. Unbought first, then bought; each
  part by category then name. A bought row is struck through in `--color-text-muted`; the tick is not colour alone.
- Tapping a row toggles bought at once (optimistic) and calls `setTripItem`. The row does not move until the store tab
  is changed or Shop is re-entered, for the same reason as To sort.
- Under the card, muted: `Have it: 4 items, not on any list.` and a text button **Change what's where**, which returns
  to Sort with **Everything** selected.
- **Footer**: primary `Done shopping · 3/9 bought`.

**Nothing to buy** (every item is Have it, or no items): no tabs; one card `Nothing to buy.` and the Have it line when
there are any. The footer still reads `Done shopping · 0/0 bought`.

**Sort or Shop mode** is the app's own state, not the API's: it is kept in `localStorage` as `forage_trip_view`
(`{trip_id, mode, store}`). For a trip with no saved view (a new device, private mode), Shop opens in Shop mode when
nothing is unsorted and at least one item is bought, else Sort. A saved view for another trip id is ignored.

## Done shopping (sheet)

Title "Done shopping?", sub-line `7 of 9 bought.` Then, when some aren't bought, a list of them, each row the name and
its store in `--color-text-secondary`, and the muted sentence `Not bought. Closing the trip forgets them, and their
meals still count as shopped.` Buttons: primary **Close the trip**, and **Keep shopping**, which closes the sheet.

**Close the trip** calls `closeTrip`; the button is disabled and `aria-busy` while it runs. On success the sheet closes,
the app switches to Plan, and the toast says `Trip closed. Its meals are marked shopped.` The saved view is cleared.

## Trip menu (sheet)

Title "This trip". Under it, one muted line per meal, `Weeknight chili · Wed Nov 5`, or `No meals` for an empty trip.
Then a list:

- **Change what's where**, in Shop mode only: back to Sort, Everything.
- **Throw this list away**, in `--color-danger-text`, sub-line `12 items. Your meals stay planned.` It replaces the
  sheet's body with the question `Throw this list away?`, the sentence `Its 12 items and your choices on them are
  deleted. Your meals stay planned.`, and **Throw away** (danger fill) and **Keep**. Throw away calls `discardTrip`; on
  success the sheet closes, Shop shows the no-trip state, and the toast says `List thrown away. Your meals are still
  planned.` The prototype throws it away on one tap; this asks first because it can't be undone in the app. Choices made
  on the food (a remembered store) are kept.

## Plan banner (#709)

#709 renders the banner as one component taking its text and an optional action. This issue passes the action
**Plan a trip** (small primary button, right) when no trip is open; it opens the trip setup sheet over Plan. When a trip
is open the banner keeps #709's text with no button (#719 changes that wording to the late-meal one). Whether a trip is
open comes from `getTrip` with no id, read alongside `getPlan`.

## States

| State | Shows |
|---|---|
| Loading | Header "Shop", then 3 skeleton rows in one card (static under reduced motion). No footer |
| No trip | The no-trip card and, when there is one, `Last trip: Oct 27, King Soopers and Costco, 19 items.` |
| Sort / Shop mode | As above |
| Error (load) | `Couldn't load your trip.` and **Try again**, `role="status"`. A trip already on screen stays under a refresh failure, with the line above it |
| Offline | The same as Error. A write fails with its own line. No queue (#700) |
| Write failed (choice, tick) | The control reverts, and a toast `Couldn't save that. Try again.` |
| Write failed (sheet) | `Couldn't save that. Try again.` under the sheet's buttons, `role="status"`, always in the DOM |
| Trip changed elsewhere | A write refused because the trip is closed or gone: toast `This trip was closed or thrown away.` and Shop reloads |

Shop reloads the trip when the tab is entered and when the page becomes visible again, so an agent's change made in
the meantime shows up.

## Copy

| Where | Text |
|---|---|
| No trip, heading | No trip in progress |
| No trip, sentence | A trip gathers what your planned meals need, so you can mark what you have and split the rest by store. |
| Last trip | `Last trip: Oct 27, King Soopers and Costco, 19 items.` (`closed_at` date; `stores` joined with "and" (three: `King Soopers, Costco and Other`); `items`, `1 item`). Absent when no trip has closed |
| Sub-line, open trip | `2 meals · through Fri Nov 7` / `1 meal · …` / `No meals · through Fri Nov 7` |
| Sort heading | Do you have it, or where will you get it? |
| Counts | `5 of 12 sorted · 3 have · 1 King Soopers · 1 Costco · 0 other` |
| Choices | Have it · King Soopers · Costco · Other |
| Why | `Suggested: you usually have this` / `Suggested: you usually get this at Costco` / `Forage will suggest King Soopers next time` |
| Footer, sorting | `Sort 3 more to make your lists` / `Sort 1 more to make your lists` / `Make lists: 9 to buy` |
| Have it line | `Have it: 4 items, not on any list.` (`1 item`) |
| Footer, shopping | `Done shopping · 3/9 bought` |
| Toasts | `Trip closed. Its meals are marked shopped.` · `List thrown away. Your meals are still planned.` · `Couldn't save that. Try again.` · `This trip was closed or thrown away.` |

The prototype's "Suggested: you got this at King Soopers last time" is changed: `usual_store` is also set from the
Library, so "last time" would sometimes be untrue. Its done-sheet line "The next trip lists them again if their meals
are still planned" is changed too: a closed trip's meals are Shopped, so the next trip doesn't list them.

## Edge cases

- **Rapid taps on choices or ticks**: each tap updates the screen at once; writes for one item go out in order, one at a
  time, and the last tap wins. A failure reverts that item to the last value the API confirmed.
- **Double tap on Build, Close, Throw away**: the button is disabled while its call is out; Build also sends its `id`.
- **The plan changes while the setup sheet is open** (an agent plans or removes a meal): the next dry run shows it; a
  build naming a meal that is no longer eligible is refused and the list reloads.
- **A meal removed from the plan after building**: the next read drops its lines (issue body); its items disappear or
  their need shrinks with no message.
- **A meal moved after building**: it stays on the trip, and the breakdown shows its new weekday.
- **A food renamed or re-categorised**: rows show what the API returns, so they follow it.
- **A recipe edited after building**: the item keeps its snapshot; a breakdown line whose recipe line is gone shows
  `Beef Stew · Fri: 2 lb` (the snapshot's `amt`).
- **Every item Have it**: Make lists is enabled, Shop mode shows "Nothing to buy.", and Done shopping closes the trip.
- **Picking a store on a "usually have" food**: the item takes the store and the food's `usual_store`; the food stays
  "usually have", so the next trip starts it as Have it again. That is the rule, not a bug.
- **Long names**: wrap to two lines; the need stays right-aligned beside the first line, and wraps under it below 360px.
- **Many items**: no limit; the page scrolls and the footer stays.
- **Midnight with the sheet open**: the 3 date chips are computed when the sheet opens.

## Accessibility and layout

- 375px: no horizontal scroll. The four choice buttons share the row equally (about 80px each at 375px, minus the
  card's padding) and are at least 44px tall; "King Soopers" wraps to two lines inside its button. Store tabs share the
  row; with three, labels may wrap to two lines.
- Category labels are `<h2>`; each group is a list. An item's choice group is named by the food's name, so a screen
  reader hears "Yellow onion, group, Have it, toggle button, not pressed".
- A shop row's accessible name is `Yellow onion, about 6 onions, bought` (or `not bought`).
- The counts line is a polite live region, so a choice's effect is announced once; the progress bar is hidden from
  assistive tech because the line says the same.
- Sheets trap focus, restore it to the opener, close on Escape, and are `role="dialog"` with the title as the name.
- Disabled footer buttons are `aria-disabled` with their text saying why, not just greyed.
- Reduced motion: sheets appear without sliding; the progress bar does not animate.

## Demo mode

Per #704, and consistent with #709's demo plan (tomorrow dinner "Weeknight chili" on list; +1 breakfast "Overnight oats"
shopped; +3 and +5 meals planned with no trip). Shop starts on an open trip through today + 5 with the one meal
Weeknight chili, in Sort with To sort selected: 9 items, 3 unsorted, 2 suggested Have it (olive oil, cumin), 2
suggested King Soopers, 1 suggested Costco, 1 already Other; one item with no shopping unit (`2 tbsp + 1 tbsp`); and
`unmatched` with one line (`1 bay leaf`). A closed trip from 4 days ago (Overnight oats) gives the Last trip line.
Sorting, shopping, closing and throwing away change the in-memory trip; after either, **Plan a trip** builds a new trip
in memory from the +3 and +5 meals, which share onion and garlic so combining shows. Nothing is saved.

## API shape

`getTrip` (`id`, or none for the open trip; `today` optional) answers `{"trip": null}` when there is none, else:

```json
{
  "trip": {
    "id": "tr_01020304", "status": "open", "through": "2026-11-07", "created": "…", "closed_at": "",
    "meals": [{ "plan_id": "pl_5d6e7f8a", "date": "2026-11-05", "slot": "Dinner",
                "recipe_id": "rc_9e8f7a6b", "recipe_name": "Weeknight chili" }],
    "items": [{
      "food_id": "fd_0a1b2c3d", "name": "Yellow onion", "category": "Produce",
      "choice": "ks", "suggested": true, "bought": false, "buy": "", "mine": false,
      "need": "about 6 onions",
      "lines": [{ "plan_id": "pl_5d6e7f8a", "date": "2026-11-05", "slot": "Dinner",
                  "recipe_name": "Weeknight chili", "line_id": "L3", "text": "2 onions, diced", "amt": "2" }]
    }],
    "counts": { "all": 12, "todo": 3, "have": 4, "ks": 3, "costco": 1, "other": 1, "to_buy": 5, "bought": 0 },
    "unmatched": [{ "plan_id": "pl_…", "recipe_name": "Beef Stew", "line_id": "L9", "text": "1 bay leaf" }]
  }
}
```

`meals`, `need`, `lines` (expanded from the snapshot, with `text` read from the recipe line and `""` when it is gone),
`counts` and `unmatched` are derived on read and never stored. `need` is `null` for an item with no lines (#719's added
items). Items are ordered by category (blank last), then name. `choice` is `""` when unsorted. `buy` and `mine` are
#719's and are carried as stored. `startTrip` answers this same shape (with `written`), and with `dry_run` the shape of
the trip it would make, `id` included. `setTripItem` answers `{ "item": {…}, "remembered": true }` (`remembered`
absent when the food didn't change). `closeTrip` and `discardTrip` answer the trip row as it was left (`discardTrip`:
`{"discarded": "tr_…", "meals_cleared": 2}`). `getTrips` rows gain `items`, `bought` and `stores` (`["ks","costco"]`).

## MCP tools (registered by this issue, in `mcp/src/forage/tools.ts`)

Per #713's rule. All go through the Forage API. `forage_get_trip` is in `FORAGE_READ_TOOLS`; the other four are write
tools and end with the connector's reminder when they write. Dates are `YYYY-MM-DD`, or `today` / `tomorrow` / `+5d`, in
America/Denver. Store names in inputs are `have`, `ks`, `costco`, `other`.

| Tool | Inputs | Calls | Result |
|---|---|---|---|
| `forage_get_trip` (read) | `trip_id` (optional; default the open trip) | `getTrip`, and `getTrips` when none is open | The trip, below |
| `forage_start_trip` (write) | `through`, `plan_ids` (optional; default every eligible meal), `dry_run` (default true) | `startTrip` | The preview, or the started trip |
| `forage_set_trip_item` (write) | `food_id`, at least one of `choice` / `bought`, `trip_id` (optional; default the open trip). #719 adds `buy` | `setTripItem` | The item as stored |
| `forage_close_trip` (write) | `trip_id` (optional; default the open trip) | `closeTrip` | Confirmation with what wasn't bought |
| `forage_discard_trip` (write, destructive) | `trip_id` (optional), `confirm` (default false) | `getTrip`, then `discardTrip` with `confirm` | The preview, or confirmation |

**`forage_get_trip` result** (no reminder):

```
Trip tr_01020304 · open · through Fri 2026-11-07 · 2 meals
  Weeknight chili · Wed 2026-11-05 Dinner (pl_5d6e7f8a)
  Beef Stew · Fri 2026-11-07 Dinner (pl_9a8b7c6d)
12 items: 3 to sort, 4 have, 3 King Soopers (1 bought), 1 Costco, 1 other.

To sort
  fd_1a2b3c4d  Cilantro · 1 bunch · Weeknight chili
King Soopers
  fd_0a1b2c3d  Yellow onion · about 6 onions · Weeknight chili, Beef Stew · bought
Have it
  fd_5e6f7a8b  Olive oil · 2 tbsp + 1 tbsp · suggested
…
Not on the list (not matched to a food): "1 bay leaf" in Beef Stew
```

An item line is `<food_id>  <name> · <need> · <recipes>`, then `· suggested` and `· bought` when they hold. No open trip:
`No open trip. Last trip: closed Mon 2026-10-27, 19 items, 17 bought.` (or `No trips yet.`).

**`forage_start_trip`, dry run** (no reminder):

```
Preview — nothing saved.
Trip through Fri 2026-11-07, 2 meals: Weeknight chili (Wed), Beef Stew (Fri).
12 items: 4 start as Have it, 5 at their usual store, 3 to sort.
Not on the list (not matched to a food): "1 bay leaf" in Beef Stew
Call again with dry_run: false to start it.
```

Saved: `Started trip tr_01020304 through Fri 2026-11-07 with 2 meals and 12 items (3 to sort).` then `Undo with
forage_undo, call …` and the reminder. Refused: `Nothing saved.` then the API's text, one line per meal it names
(`pl_1a2b3c4d is a note, not a recipe meal.`, `pl_… is already on trip tr_….`, `pl_… is dated 2026-11-04, today or
earlier.`, `pl_… is dated 2026-11-12, after Fri 2026-11-07.`), or `A trip is already open (tr_01020304). Close it or
throw it away first.`

**`forage_set_trip_item`, saved** (reminder follows): `Yellow onion: King Soopers, not bought. Forage will suggest King
Soopers next time.` (the last sentence only when `remembered`). Refused: `Nothing changed. Yellow onion isn't on trip
tr_01020304.` · `Nothing changed. Only an item with a store can be bought.` · `Nothing changed. Trip tr_01020304 is
closed.`

**`forage_close_trip`, saved** (reminder follows): `Closed trip tr_01020304: 15 of 17 bought. Not bought: cilantro (King
Soopers), feta (Costco). Its 2 meals now read as shopped.`

**`forage_discard_trip`**: without `confirm`, `Would throw away trip tr_01020304: 12 items, 2 meals go back to planned
with no trip. Call again with confirm: true.`; with it, `Threw away trip tr_01020304. 2 meals are planned with no trip.`
then the undo line and the reminder. A closed trip: `Nothing changed. Trip tr_01020304 is closed; only an open trip can
be thrown away.`

Other refusals pass the API's fixed text after `Nothing saved.` / `Nothing changed.`; a tool error never shows the API
key or URL.

**Undo** is #713's (`undoCall`): `startTrip` is undone by deleting the trip and its items and clearing the meals'
`trip_id`; `setTripItem` by restoring the item and the food's `usual_store`; `closeTrip` by reopening (refused if
another trip has been opened since, as a second open trip); `discardTrip` by recreating the trip and items and setting
the `trip_id`s back. Any of them is refused, naming the rows, when a row it touched has changed since; a stale-line
prune counts as a change.

**Tool descriptions** (what an agent reads): `forage_get_trip`: "Reads the open shopping trip: its meals, and each item
with what the meals need, where it'll be bought, and whether it's bought." `forage_start_trip`: "Starts a shopping trip
for planned recipe meals after today through a date. Previews first. One trip can be open at a time."
`forage_set_trip_item`: "Sets an item on the trip to have, ks (King Soopers), costco or other, or marks it bought.
Picking a store also makes it the food's usual store." `forage_close_trip`: "Closes the open trip after shopping; its
meals then read as shopped." `forage_discard_trip`: "Throws the open trip away. Its meals stay planned. Previews unless
confirm is true."

**Docs and lists**: a row per tool in `mcp/docs/forage-tools.md`; every trip action out of `PENDING_TOOLS`; the four
writes in `CHANGE_LOGGED_ACTIONS` (`startTrip`: Trips, TripItems, Plan; `setTripItem`: TripItems, Foods; `closeTrip`:
Trips; `discardTrip`: Trips, TripItems, Plan); `forage_discard_trip` added to `mcp/CLAUDE.md`'s "Approving the
destructive tools".

## Measured

Nothing is measurable yet: there is no running Forage app (`forage/frontend` is created by #701 and #704). The 375px
and 44px criteria are checked at `/test` with `getBoundingClientRect()`, per `stack-web`. The "about 80px" per choice is
arithmetic from the prototype's layout, not a measurement, and is not a criterion.

## New tokens

None.
