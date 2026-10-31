# 719 — Forage shopping trips B: added items, buying amounts and late meals

Specifies [#719](https://github.com/luketmoss/keel/issues/719), the second half of [#710](https://github.com/luketmoss/keel/issues/710).
The trip rules (`trip_id`, stale lines, the amount rule, defaults) are #710's body and are copied into #719; this note
does not restate them. Tokens, chips, bottom sheets, banners and the status line come from
[`suite-language.md`](../../../ui/docs/design/suite-language.md); the shell and empty states from
[`704-app-shell.md`](704-app-shell.md); the food form's pack sizes, Regular and Never-on-a-list switches from
[`707-food-library.md`](707-food-library.md); the plan banner component from [`709-meal-plan.md`](709-meal-plan.md).
The Shop tab's own screens (setup, Sort, Shop mode, Done shopping, trip menu) are #718's design note and are not repeated
here; this note adds to them and says where. Layout reference is the approved prototype
(https://claude.ai/artifact/JYyHpvdbgohjmzZZsN7jY1: `itemResults`, the `addItem` and `buyAmt` sheets, `lateMeals`, the
`needSort` banner). There are no standing documents in `forage/docs/design/` beyond #702's.

## Where it joins #718

| #718 surface | #719 adds |
|---|---|
| Header of Sort and Shop mode: `Shop`, a sub line, a **Trip** button | an **Add** button left of Trip, and `· N added by you` on the sub line (N = items with `mine` and no meal lines, shown only above 0) |
| Each Sort item's amount button (`about 6 onions`, or `How much?`) | opens the **buying amount sheet**; with a buying amount the button reads `Buying 18 pack` and, under it, `meals need about 3 eggs` |
| Shop mode row second line | `18 pack · meals need about 3 eggs`; with no buying amount the meals' amount and a short list of meals; an added item with no meals says `Added by you` |
| Banners above the store tabs | the late-meals banner and the `N added items need a store` banner |
| `closeTrip` | remembers each bought item's buying amount on its food (see "Remembering what you bought") |
| Plan tab banner (#709's component, #718's **Plan a trip** variant) | the open-trip variant |

Items are the same rows as #718's: one per food. An added item is a row with `mine` set and, until a late meal joins it,
no lines. #718's Sort screen groups by food category, so an added food with no category lands under **Other**.

## Add sheet

Opened by **Add**. A bottom sheet, title "Add to the list". In order:

1. A search field, placeholder `Search your foods, or type anything`, `type="search"`, `autocomplete="off"`, autofocus
   only on a pointer device (a phone keyboard would cover the list).
2. Results, then a **Done** button at the foot that closes the sheet. The sheet stays open after an add so several can
   be added in a row.

**With no search text** the list is headed `Your regulars` (the label style of #707's chips) and holds every food with
`regular` set and `never_shop` clear, by name. Empty: one ghost row, "No regulars yet. Mark the foods you buy every week
as regulars in your library, or type to search." (no button: the Library tab is one tap away on the tab bar).

**With search text** (debounced by 250 ms, `getFoods` with `q`, at most 8 results, `never_shop` foods left out):
matching foods, then, unless a food's name already matches the text exactly (ignoring case and surrounding spaces), a
last row **Add "dragon fruit"** with the second line `A new item. Forage remembers it for next time.`

A food row is a button of 44px or more. Line one is `brand name`. Line two depends on the food:

| The food is | Line two | Right edge | Tap |
|---|---|---|---|
| not on the list | `King Soopers · last time 18 pack` (only the parts that exist; `No usual store yet` when it has neither a store nor a last time) | plus icon | adds it |
| on the list for meals | `On the list for 2 meals · tap to change how much` | tick | opens the buying amount sheet |
| on the list, added | `On the list` and, with a buying amount, `: 18 pack` | tick | opens the buying amount sheet |

Adding a food shows, in the sheet's status line (`role="status"`, always in the DOM): `Added Milk to King Soopers: 1
gallon.`, or `Added Milk.` when it has no usual store and no last time, then `Pick its store on the list.` when it has no
store. Adding free text: `Added dragon fruit. Pick its store on the list.` and the search field is cleared. A food the
list already has never adds twice: its row is the tick row.

After **Add "…"** the new food is in the library as a name with no nutrition (#706's kind), so Library shows it, and the
row for it in the results is now the tick row.

The row that was just added is focused again after the list re-renders, so a second tap on the same row opens its
amount instead of adding again.

## Buying amount sheet

Opened from a Sort item's amount button, or from a tick row in the Add sheet. A bottom sheet. In order:

1. A small label with the store (`King Soopers`, `Costco`, `Other`, `Have it`, or `Not sorted yet`), then the food's name
   as the title.
2. **What the meals need.** An item with meal lines: a bordered card (`--color-border-light`, `--radius-md`) headed `Your
   meals need` with the amount (`about 3 eggs`, `--text-md` bold) and, under it, one row per line: the line's amount at
   the left and `Beef Stew · Tue` at the right. An added item with no lines: one sentence, "Not in any planned meal. You
   added it."
3. **You're buying**, a text field (label above, 60 characters at most), placeholder `Just what the meals need` for an
   item with lines and `For example, 1 gallon` for one without. Its value starts as the item's `buy`.
4. **Size chips** when the food has any: its saved pack sizes, then its last bought amount when that is not one of them.
   The chip whose text equals the field is `aria-pressed`. The last-bought chip reads `18 pack · last time`; when
   `last_buy` equals a saved size, that one chip carries the suffix and there is no second chip. Tapping a chip fills
   the field; tapping the pressed chip empties it.
5. **Save** (primary). Disabled while the field equals the item's current `buy`. Saving blank is how a buying amount is
   cleared. It closes the sheet, or returns to the Add sheet when it was opened from there.
6. **Buy just what the meals need**, shown only for an item with lines that has a buying amount. It clears the amount
   and closes the sheet, at once. It is a text button, not a second primary.
7. **Take off the list**, shown only for an added item with no lines, as a text button in `--color-danger-text`. It
   removes the item with no confirmation (it is one tap to add back, and nothing is lost: the food stays in the library)
   and shows the status line `Taken off the list.`; opened from the Add sheet it returns there.

An item with meal lines can't be removed: there is no control for it. (A meal leaves the list when it is thrown away or
removed from the plan, #718's and #709's rules.)

Choosing **Have it** for an item never clears its buying amount; the Shop tab simply doesn't list a Have it item.

## Late meals

A **late meal** is a recipe meal dated after today and on or before the open trip's `through` that has no `trip_id`.
The API lists them (`late_meals`, below); the app never works them out.

**Shop banner** (above the store tabs, in Sort and in Shop mode; `--color-warning-light` background, `--color-text`):

> **Beef Stew** (Thu Nov 5) was planned after this list was made.        **[Add its items]**

For two or more: `**2 meals** were planned after this list was made.` with **Add their items**. The meal's name and date
come from the first late meal by date. Tapping the button calls `addToTrip` with `late_meals`, disables itself and sets
`aria-busy` while the call is out, then removes the banner and shows a status line: `3 new items, and more of 2 already
on the list.`; when none are new, `More of 2 items already on the list.`; when none are either, `Beef Stew is on the trip.
It needs nothing new on the list.`

New items arrive with #710's defaults (Have it for a usually-have food, else its usual store, else unsorted). An item
already on the list keeps its choice and its bought tick; only its lines, and so its "meals need" amount, grow. When a
Have it or bought item grew, its row in the Sort screen's **Everything** filter reads `More needed: about 8 onions`
(`--color-warning` text, in addition to the amount), so a grown amount isn't missed.

**Plan banner**, #709's component with its text and optional action. When a trip is open and `late_meals` is not empty:
the same sentence as above and a **Add to list** button that goes to the Shop tab, where the banner above is waiting
(the approved prototype's flow; adding from the Plan tab would hide the "N added items need a store" result). When a
trip is open and nothing is late, no banner (#709's "aren't on a shopping trip" wording belongs to the no-trip case,
which #718 owns). With no trip open the banner is #718's.

## "N added items need a store" banner

In Shop mode only, above the store tabs and under the late-meals banner, when the trip has unsorted items (a late meal's
new unsorted items count as added):

> **2 added items need a store** before they show on a list.        **[Sort]**
> (`1 added item needs a store` before it shows on a list.)

**Sort** returns to the Sort screen with its **To sort** filter on (#718's controls). The banner is a plain region.

## Remembering what you bought

When **Close the trip** runs, for every item that is **bought**, whose choice is a store (not Have it), and that has a
buying amount, the API writes the amount to the food's `last_buy` and the closing date to `last_bought_on`. An item with
no buying amount writes nothing and leaves an older `last_buy` alone. An item that wasn't bought writes nothing, even
with a buying amount.

Next time:

- The Add sheet's row shows `last time 18 pack`, the amount sheet gets a `· last time` chip, and **adding that food** puts
  its `last_buy` in the item's buying amount, which can be edited or cleared at once.
- Meal items are **not** prefilled: their starting point is what the meals need, and a buying amount is something you
  chose this trip. The `· last time` chip is still offered on their sheet.

Both are copy-and-edit. Nothing about a buying amount is ever a quantity the app multiplies or compares.

## States

| State | Shows |
|---|---|
| Add sheet, loading results | Under the field, two skeleton rows (static under reduced motion). The field stays usable |
| Add sheet, no regulars | The ghost row above |
| Add sheet, no match | Only the **Add "…"** row |
| Add sheet, library search failed | "Couldn't search your foods." with **Try again**, in `role="status"`. **Add "…"** still works |
| Writing | The tapped row or button is disabled and `aria-busy`; the sheet stays until the call returns |
| No open trip when a write arrives (thrown away or closed in another tab or by an agent) | The sheet closes and the Shop tab shows its no-trip state with `That list was already closed.` |
| Write failed (any sheet) | `Couldn't save that. Try again.` (`role="status"`, under the buttons, always in the DOM) |
| Offline | The same as write failed; no queue (#700) |
| Food gone (deleted since the sheet opened) | `That food isn't in your library any more.` and the results reload |

## Copy

| Where | Text |
|---|---|
| Add sheet title | Add to the list |
| Search placeholder | Search your foods, or type anything |
| Regulars heading | Your regulars |
| New item row | Add "dragon fruit" / A new item. Forage remembers it for next time. |
| Never-on-a-list food added by id (API refusal, agents only) | `Water is set to never go on a list. Change that on the food first.` |
| Amount sheet fields | Your meals need / You're buying / Save / Buy just what the meals need / Take off the list |
| Added by you (no meals) | Not in any planned meal. You added it. |
| Late banner | `Beef Stew (Thu Nov 5) was planned after this list was made.` / **Add its items** |
| Late banner, several | `2 meals were planned after this list was made.` / **Add their items** |
| Plan banner, open trip | the late sentence, **Add to list** |
| Store banner | `2 added items need a store before they show on a list.` / **Sort** |
| Taken off | Taken off the list. |

## Edge cases

- **Rapid repeat.** Every Add-sheet row and **Add their items** is disabled while its call is out. The API makes each add
  idempotent: a food already on the list, free text matching a food's name, and late meals already on the trip all
  answer success with nothing changed.
- **Same text, different case.** "milk", "Milk" and " milk " are one food; free text matches an existing food by name
  (ignoring case and surrounding spaces) before creating one, and the answer says `matched_existing`. Text is trimmed,
  inner runs of spaces collapse, the first letter is capitalised, and it is 1 to 80 characters (longer or empty is
  refused with the text "Give the item a name of 1 to 80 characters.").
- **A buying amount with only spaces** is blank and clears.
- **A food on the list that was deleted** can't be: #703 refuses deleting a food used by a trip item.
- **A stale meal line** (#710's rule) can leave an added item with no lines and `mine` set; it stays, with **Take off the
  list**.
- **A closed trip** takes no add, remove or buy edit: the API refuses with `That trip is closed.` and the app never offers
  the controls (Shop mode shows only open trips).
- **Items bought, then more meals added.** The tick stays. The row shows the new amount.
- **No grams, no shopping unit.** The "meals need" text is #710's rule; a free-text food added by you has no shopping
  unit and never shows "meals need".
- **Long names and amounts** wrap to two lines in rows; in the amount button the buying amount truncates with an
  ellipsis after two lines and the full text is in the sheet.
- **Midnight with the app open.** `late_meals` is computed from the `today` the app sends (device date, as #709), so the
  next load recomputes it.
- **Regular food with a usual store** added from the Add sheet starts sorted to that store (`suggested`); a usually-have
  food added by hand is still sorted to its usual store, never to Have it (you added it because you want it).

## Accessibility and layout

- 375px: no horizontal scroll; chips wrap. Every row, chip and button is 44px or more, including **Add**, **Done** and
  the text buttons in the amount sheet.
- Sheets trap focus, restore it to the opener, close on Escape, and are `role="dialog"` named by their title.
- A food row's accessible name is `Milk, King Soopers, last time 1 gallon, add to list` (or `…, on the list, change how
  much`). The tick is also the words "On the list", never colour or icon alone.
- Banners are plain regions; the status lines are `role="status"`.

## Demo mode

Extends #718's sample trip (same gate, nothing saved): the sample library has two regulars (Milk with a 1 gallon pack
size and `last_buy` `1 gallon`; Eggs with `18 pack`, `12 pack`, last time `18 pack`), the sample open trip has one added
item (Paper towels, no meals, unsorted) and one late meal (a Thursday dinner after the list was built), so every state in
this note can be reached. Adds, buying amounts, removals and **Add its items** change the in-memory trip.

## API shape

All in `forage/apps-script/src/trips.js`, on #703's Foods, Trips and TripItems tabs; follow #718's `getTrip` item shape
for the fields it already names.

**`addToTrip`** (write): `trip_id` (optional, the open trip), and exactly one of `food_id`, `text`, `late_meals` (true),
and `today` (YYYY-MM-DD, for `late_meals`; default America/Denver, #703). Answers
`{ "trip": <getTrip>, "added": [food ids newly on the list], "joined": [food ids whose lines grew], "meals": [plan ids
put on the trip], "food": {id, name, created: bool, matched_existing: bool} | null }`. For `text` it creates the food
(`kind` ingredient, `source` `manual`, name only, `category` blank) unless one matches. For `food_id` of a food already
on the list it answers success with all three lists empty. Refused, with these texts: no open trip (`No shopping trip is
open.`), a closed trip (`That trip is closed.`), an unknown food (`No such food: fd_…`), a `never_shop` food (see Copy),
none or more than one of the three inputs (`Give one of food_id, text or late_meals.`), a bad name (see Edge cases). The
default choice of a new item is the food's `usual_store`, never `have` (#710's rule, applied only to meal items); its
`buy` is the food's `last_buy`; `mine` is true (a late-meal item's `mine` stays false). For
`late_meals` it sets `trip_id` on each late meal, builds items with the same code as `startTrip`, appends lines to an item
already on the list (keeping its choice and bought) and creates the rest with #710's defaults.

**`setTripItem`** (#718's) gains `buy`: a string up to 60 characters, trimmed; blank or spaces clears it. It writes only
`buy`; `choice`, `bought` and the store memory stay #718's. A closed trip is refused.

**`removeTripItem`** (write): `trip_id` (optional), `food_id`. Refused when the item has lines (`That item is on the list
for 2 planned meals.`), when it isn't on the list (`Nothing changed. Milk isn't on the list.`), or when the trip is
closed. Deletes the TripItems row only; the food stays.

**`getTrip`** gains per item `need_text` (already #710's derived amount), `packs`, `last_buy`, `last_bought_on` (copied
from the food so the sheet needs no second call), and per trip `late_meals`: `[{plan_id, recipe_name, date, slot}]`,
ordered by date then slot, empty when the trip is closed. **`getPlan`** (#709's) gains the same `late_meals` array (empty
when no trip is open), which the Plan banner reads.

**`closeTrip`** (#718's) gains the last-buy write above. It is one batch with the status change, and the change record
(for `forage_undo`) stores each food's prior `last_buy` and `last_bought_on` so undoing a close restores them.

## MCP

All in `mcp/src/forage/tools.ts`, registered by this issue per #713's rule; the PR touches `mcp/**` and is human-reviewed.
The three `PENDING_TOOLS` entries for these actions leave the list, each gets a row in `mcp/docs/forage-tools.md`, and
`addToTrip` and `removeTripItem` join `CHANGE_LOGGED_ACTIONS`. Build #713 and #718 first.

| Tool | Arguments | Calls | Answer |
|---|---|---|---|
| `forage_add_to_trip` (write) | exactly one of `food_id`, `text`, `late_meals`; optional `today` | `addToTrip` | text below |
| `forage_remove_from_trip` (write) | `food_id` | `removeTripItem` | text below |
| `forage_set_trip_item` (#718's) | gains `buy` (text; empty clears) | `setTripItem` | its saved line gains the buy |

`forage_remove_from_trip` is not in #710's list; #713's parity test requires a tool or a `NO_TOOL` for every `main.js`
action, and an agent should be able to take off what it added.

Examples (each write is followed by #713's undo reminder):

```
Added milk to the list: King Soopers, 1 gallon. (fd_1a2b3c4d)
Added Paper towels, a new item. It needs a store.
Milk is already on the list.
Added 2 meals' items: 3 new, more of 2 already on the list. 1 item needs a store.
Nothing changed. No shopping trip is open.
Took Paper towels off the list.
Nothing changed. Onions is on the list for 2 planned meals.
```

**Undo** (#713's `undoCall`, stricter check): an add is undone by deleting the item, and the food too when this call
created it and nothing else uses it; a late-meals add is undone by clearing the `trip_id`s it set and the lines it
added. It is refused, naming the item, when the item has since been sorted, bought or given a buying amount, and for a
late-meals add when the meal has since moved off the trip. A removal is undone by recreating the row. A `buy` change is
undone by restoring the prior value.

**Tool descriptions:** `forage_add_to_trip`: "Adds a food, a new item by name, or the meals planned since the list was
made to the open shopping trip. A new name becomes a food with no nutrition." `forage_remove_from_trip`: "Takes an item
you added off the open trip. Items needed by planned meals can't be removed." `buy` on `forage_set_trip_item`: "What you
are buying, as free text, for example '18 pack'. Empty clears it."

## Measured

Nothing is measurable yet: there is no running Forage app. The 375px and 44px criteria and the 60-character field are
checked at `/test` with `getBoundingClientRect()`, per `stack-web`.

## New tokens

None.
