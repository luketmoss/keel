# 707 — Forage food library

Specifies [#707](https://github.com/luketmoss/keel/issues/707). Tokens, spacing and touch targets come from
[`suite-language.md`](../../../ui/docs/design/suite-language.md); the shell, header and account button from
[`704-app-shell.md`](704-app-shell.md); bottom sheets, the status line and the "Which food is this?" chooser from
[`706-recipe-import.md`](706-recipe-import.md), which this note reuses and does not restate. The layout reference is
the approved prototype (https://claude.ai/artifact/JYyHpvdbgohjmzZZsN7jY1): the Library's Foods list, the food
sheet, the Add a food sheet and the recipe sheet's nutrition block. There are no standing documents in
`forage/docs/design/` beyond #702 and #704. Every length is a token; nothing here introduces one.

## Library

The Library tab keeps its header and account button. Under the header, the prototype's two-button switch
**Recipes (n) | Foods (n)**, `aria-pressed`, remembered for the session. The header's primary small button follows
the switch: **Import** on Recipes (#706), **Add food** on Foods.

### Foods list

- A search field under the switch, "Search foods", filtering on brand and name, case-insensitive substring. Shown
  once the library holds 8 or more foods.
- Two cards, **Packaged** and **Ingredients**, each with a count; a card with no foods is not drawn. Sorted by
  name within a card.
- A row is 44px or more and opens the food sheet. Line one: brand then name (`KIND Dark Chocolate Nuts & Sea
  Salt bar`). Line two:
  - packaged with a label serving: `180 kcal a bar`;
  - otherwise with nutrition: `364 kcal / 100 g`;
  - without: a `No nutrition yet` chip in `--color-warning` on `--color-warning-light`;
  - then ` · usually have` when set, and a `Not checked` chip (same colours) when `source` is `off` and `verified`
    is blank.
  - The usual store is a chip at the right: King Soopers, Costco or Other.
- Search with no match: "No food matches "<text>"." and a button **Add "<text>"** opening the label form with the
  name filled in.

| State | Shows |
|---|---|
| Empty (no foods) | #704's icon and heading "No foods yet". Sentence replaced by: "Add the starter list, about 75 pantry staples with their nutrition, or add a packaged food from its barcode." Two buttons: **Add the starter list** (primary) and **Add a food** |
| Loading | Three skeleton rows in `--color-surface-raised`; reduced motion shows them static |
| Loaded | The cards |
| Failed | `role="status"` in `--color-danger-text`: "Couldn't load your foods." and **Try again** |

## Add a food

A bottom sheet "Add a food" with three full-width rows, each 56px or more with an icon, a title and one line:

| Row | Line | Opens |
|---|---|---|
| Scan or enter a barcode | Looks it up on Open Food Facts. | Barcode sheet |
| Type from a label | For packaged foods, or anything you know the numbers for. | Food form, empty |
| Choose from the starter list | About 75 pantry staples, with nutrition and weights. | Starter sheet |

### Barcode sheet

Title "Barcode". A field "Barcode" (`inputmode="numeric"`, digits only, 8, 12, 13 or 14 of them; spaces are dropped)
focused, and a primary **Look up** disabled until the field holds one of those lengths. Under it, when the browser
has `BarcodeDetector` with `ean_13` and `upc_a`, a button **Scan with the camera**; otherwise that button is not
drawn and nothing says it is missing.

**Camera.** Tapping asks for the camera. The view replaces the sheet body: a live video, a guide frame, "Hold the
barcode inside the frame." and **Cancel**. The first detected code fills the field, stops the camera and runs the
lookup. If permission is refused or there is no camera: "Couldn't use the camera. You can type the barcode instead."
and the field stays. Closing the sheet always stops the stream.

| Lookup state | Shows |
|---|---|
| Looking up | Look up disabled, "Looking up…" with a spinner, up to 15 seconds |
| Found | The food form (below), prefilled, with the Open Food Facts banner |
| Already yours | "That's already in your library as <brand name>." and **Open it** (opens its sheet). No form |
| Not on Open Food Facts | "Open Food Facts doesn't have this barcode." and **Type it from the label**, which opens the form with the barcode kept |
| Found, no nutrition | The form prefilled with the name, brand and barcode, nutrition blank, banner: "Open Food Facts has no nutrition for this one. Type it from the label." |
| Not a barcode | Inline under the field: "A barcode is 8, 12, 13 or 14 digits." The button stays disabled |
| Busy (429) | "Open Food Facts is busy. Try again in a minute." |
| Failed | "Couldn't reach Open Food Facts. Try again, or type it from the label." |

### Food form

Used for Add and for Edit. A full-height sheet (it is long), with a header **Cancel** / title / **Save**. Fields in
this order:

1. **Kind:** chips **Packaged** | **Ingredient**. Default Packaged when reached from a barcode, Ingredient when from
   the empty-search shortcut.
2. **Brand** (packaged only) and **Name** (required).
3. **Nutrition.** The label depends on the kind:
   - Packaged: **Serving** (name, "bar") and **Serving weight (g)**, then a row **Per serving** with kcal, Protein g,
     Carbs g, Fat g. Beneath, in `--color-text-secondary`: "That's 450 kcal per 100 g." The per-100 g figures are
     what is stored, to two decimals; the form always shows the per-serving figures rounded to 0.1.
   - Ingredient: the four fields as **Per 100 g**.
   - Leaving all four blank is allowed ("No nutrition yet"). Some but not all: Save is disabled and the missing
     fields say "Needed if you enter any".
4. **Weights** (ingredient or packaged): a list of rows, each a name and grams (`cup` 125 g, `clove` 3 g), with a
   **Remove** (44px) and an **Add a weight** row. The first row is labelled "Default" in `--color-text-secondary`: it
   is used when a recipe or log line has no unit. For a packaged food with a label serving, that serving is the
   first row. Helper: "Recipes use these to turn cups and cloves into grams."
5. **Shopping unit:** three fields, **Singular** ("onion"), **Plural** ("onions"), **Grams each** (110). Helper: "On
   a shopping list it's counted in these."
6. **Where you usually get it:** chips King Soopers | Costco | Other, tapping the selected chip clears it.
7. **Pack sizes:** chips of the saved sizes, each removable, and an input "Add a size, for example 1 gallon" with an
   Add button.
8. **Switches:** **Usually have it** ("Shopping lists start these as 'Have it'"), **A regular** ("Offered on every
   shopping list"), **Never on a list** ("For things like water").
9. **Barcode** (optional; same digit rule).
10. **Open Food Facts foods only:** a checkbox row **I've checked these numbers against the label**, unticked, at the
    bottom above Save.

Save is disabled while: the name is empty, the nutrition is partly filled, a serving has no name or grams > 0, or
(Open Food Facts food, not yet verified) the checkbox is clear. A food that was verified keeps `verified` and the
checkbox starts ticked on Edit. Editing the nutrition of a verified Open Food Facts food clears `verified` and unticks
the box again, because the numbers changed.

**The banner** (Found and Found-no-nutrition) sits at the top of the form in `--color-warning-light` with
`--color-warning` text: "**Found on Open Food Facts** (<code>). It's shared data, so check it against the label
before saving." When the API's `warnings` has `energy_mismatch` it adds a second line: "The calories don't match the
macros: protein, carbs and fat add up to about <n> kcal, and this says <n>. Check the label." The warning rule is in
the API (kcal differs from P×4 + C×4 + F×9 by more than 20% and 20 kcal). The warning does not block saving.

**Save refused** (`role="status"` above the buttons, `--color-danger-text`): "Couldn't save: <fixed reason>", for
example "a food named KIND Dark Chocolate Nuts & Sea Salt bar already exists" or "protein, carbs and fat add up to
more than 100 g per 100 g". The form stays editable. A network failure: "Couldn't save. Your edits are kept here.
Try again."

## Starter sheet

Title "Starter list". A search field, then one card of rows sorted by name; each row 44px or more with a checkbox
(the whole row is the target), the name, and `364 kcal / 100 g · cup, clove` as line two. Three row kinds:

- **Not in the library:** selectable.
- **In your library** (`in_library`): not selectable, the name in `--color-text-muted`, "In your library" at the right.
- **Name only** (`can_fill`): selectable, line two "Add nutrition to your <name>".

A fixed button at the bottom, **Add N foods** (disabled at 0; "Add the starter list" is not a separate button: **Select
all** is a text button at the top that ticks every selectable row). On success the sheet closes to the Foods list with
the status line "Added 12 foods" (or "Added 10 foods, filled in 2", or "Added Flour"), four seconds, `role="status"`.
A failure keeps the ticks and says "Couldn't add the starter foods. Try again."

## Food sheet

Opened from a row. A bottom sheet:

1. Label line: `Packaged food` or `Ingredient`, then ` · Open Food Facts`, ` · USDA`, ` · From the label` or nothing
   (source `off`, `usda`, `label`, `manual`). Open Food Facts keeps its name here: it is the attribution its licence
   asks for.
2. Title: brand then name. Chips under it: `Not checked against the label` (off, unverified).
3. A table "Per" with a row for each weight (`1 cup (125 g)`) and one for `100 g`, columns kcal · P · C · F, as the
   prototype's. Without nutrition: the warning banner "No nutrition yet. Recipes that use it leave it out of their
   totals." and **Add nutrition**, which opens the form focused on the first nutrition field.
4. If it has a shopping unit: "On a shopping list it's counted in onions, about 110 g each."
5. **Where you usually get it:** the store chips, saved on tap.
6. **Pantry** chips **Usually have it** and **A regular**, saved on tap. (The other form fields are changed in Edit.)
7. **Used in:** the recipes that use it, names only, or "Not used in any recipe yet."
8. Buttons: **Edit** (secondary) and **Delete food** (danger text).

A chip toggle saves at once. While saving the chip is `aria-busy`; if the save fails the chip returns to its old state
and the status line says "Couldn't save. Try again."

**Delete.** "Delete <name>? Recipes and shopping lists can no longer use it." with **Delete** (danger) and **Cancel**.
A refusal replaces the body with the API's text and the recipes named: "Used by Beef Stew and Chili. Remove it from
those first." (the sheet shows at most 3 names and "and 2 more"). Deleting closes to the list with "Deleted <name>".

## Recipe Nutrition sheet

The recipe rows #706 draws in Library become buttons that open this sheet (#706 said "not links until #708"; this
issue makes them links to a nutrition-only sheet, and #708 adds Cook and the steps to the same sheet). The "…" delete
button of #706 stays and does not open the sheet.

1. Title: the recipe name, and `serves 6 · example.com`.
2. A card with `520` kcal a serving (`--text-xl`, tabular figures), `, partial` after it when partial, then `Protein
   32 g · Carbs 40 g · Fat 22 g`. A recipe with no nutrition on any counted line shows "No nutrition yet" instead of
   a number.
3. **Banner** when `missing` is not empty (the prototype's `banner warn`): one block per missing line, in the recipe's
   order, each with its text bold and its own action as a link-styled 44px button on the next line:

   | Reason | Text | Action |
   |---|---|---|
   | `no_food` | "**1 lb ground beef** has no food yet." | **Choose a food** |
   | `no_weight` | "**1 15 oz carton ricotta** has no weight yet, so it's left out." | **Set a weight** |
   | `no_nutrition` | "**Herbes de Provence** is left out: it has no nutrition yet." | **Add nutrition** |

   `no_nutrition` alone does not say "partial" (the rule is #703's); the banner is still shown, in the neutral
   `--color-text-secondary` rather than `--color-warning`, because the recipe is not partial.
4. **Ingredients, as the source wrote them:** a two-column table. Left: the verbatim line, and under it the food
   and weight in `--color-text-muted` (`ground beef · 454 g`). Right: that line's kcal a serving, or a `—` chip for a
   line left out. A line that is optional is marked "optional" and shows `—` with no banner. The right column is
   labelled "kcal per serving from each line".

Actions open the existing sheet on top: **Choose a food** is #706's chooser (the line's status refreshes on return),
**Add nutrition** is the food form, **Set a weight** is below. Closing any of them returns here with the figures
refreshed ("Updating…" in place of the kcal number while it refetches).

### Set a weight

A small bottom sheet. Title "Set a weight". Body: "How much does **1 carton** of ricotta weigh?" The unit is the
line's own word (`carton`, `medium`, `cup`, `can`). A bare count is stored as `each` and asked with the food's
singular ("4 chicken breasts" asks "How much does 1 chicken breast weigh?"). One field with `inputmode="decimal"`, placeholder "425", helper "In grams, or write 15 oz."
It accepts a number (grams), `<n> g`, or `<n> oz` (× 28.3495, one decimal) and shows the grams it understood under
the field as "= 425.2 g". Under that, from `used_by`: "Also used in Chili and Lasagna." when there are others.
Buttons **Save** and **Cancel**. Save stores the weight on the food under that unit name and the sheet closes to the
Nutrition sheet.

Invalid input: Save disabled; the helper turns to "Enter a weight above 0, up to 5,000 g." Replacing an existing
weight with the same name asks nothing (it is the same fix).

## Starter foods in the chooser

In #706's "Which food is this?" sheet, **Suggested** may hold up to three rows, library foods first, then starter
foods. A starter row reads `Flour, all-purpose` with `From the starter list` as line two and a small plus icon. Tapping
it adds the food (the same `addStarterFoods` call, one id), matches the line and returns to the review screen with the
preview refreshed; if the add fails, the sheet stays with "Couldn't add it. Try again." A starter suggestion is never
the one pre-selected, and `sugar` is offered `Sugar, granulated` and never anything from the spike's `sugar-apples`.

## Demo mode

The Foods list starts with 6 sample foods (flour, an onion with a `medium` 110 g weight, butter, a granola bar,
yogurt, an unnamed-nutrition spice). The starter list is a sample of 8. Barcode `0000000000000` answers "not on Open
Food Facts"; any other valid code answers one made-up product (an original name, not a real brand) with an energy
mismatch warning, so the warning can be seen. The banner of #704 stays visible on every sheet.

## MCP tools (registered by #713)

Specified here so #713 can build them without rereading the issue. All five go through the Forage API; the read tools
on the read connector and the other three on the write connector. A write ends with the connector's "Forage (write) is
on" reminder (#713), naming the food.

| Tool | Inputs | Calls | Result |
|---|---|---|---|
| `forage_search_foods` (read) | `q`, `kind`, `regular`, `barcode`, `include_starter` (default false), `limit` (default 20) | `getFoods`, `getStarterFoods` | Compact foods: `id, name, brand, kind, kcal_100g, protein_100g, carbs_100g, fat_100g, has_nutrition, verified, source`. With `include_starter`, starter rows carry `starter_id` and `in_library` |
| `forage_get_food` (read) | `id` | `getFood` | The whole food, its weights, its shopping fields and `used_by` |
| `forage_add_food` (write) | One of `barcode`, `starter_id`, or `food` (the fields of the form: `name`, `kind`, `brand`, `serving` `{name, g}` with `per_serving` `{kcal, protein, carbs, fat}`, or `per_100g`, `weights`, `buy_unit`…). `dry_run` (default true), `verified` (default false) | `lookupBarcode`, `addStarterFoods`, `upsertFood` | The preview with `dry_run` true: the food as it would be stored, the Open Food Facts `warnings` and `already_in_library`. With it false, the stored food |
| `forage_update_food` (write) | `id` plus any of the food's fields; `weights` replaces the named weights it lists and leaves the others; `verified` | `upsertFood`, `setFoodWeight` | The stored food |
| `forage_delete_food` (write) | `id` | `deleteFood` | Confirmation, or the refusal with the recipes named |

- `verified` is `true` only when the owner has said the numbers match the label; an agent that did not check leaves it
  default. The tool description says so, because the whole point of Open Food Facts data is that it can be wrong.
- A barcode add with `dry_run` false and `verified` false stores the food unchecked; the app then shows it as "Not
  checked" until the owner ticks the box in Edit.
- **Undo** is #713's: adding is undone by deleting the food, an update by restoring the prior row.
- `forage_delete_food` is not in the issue's original four; the epic's parity rule ("anything the app can do, an
  agent can do") needs it because the app can delete.

## Accessibility and layout

- 375px: no horizontal scroll; the Foods row's chips wrap under the name rather than truncating it; the Nutrition
  table scrolls its text, never the page.
- Every control is at least 44px, including chips, Remove, the camera button and the table's action buttons. Sheets
  trap focus, restore it to the opener on close, and close on Escape. The camera view's Cancel is reachable by
  keyboard and Escape stops the stream.
- Status changes (saved, added, failed, updating) are in `role="status"` regions. Partial, "Not checked" and "No
  nutrition" are text and a chip, never colour alone.
- The camera sheet has an accessible name ("Scan a barcode") and the video is `aria-hidden`; the typed field is the
  accessible route.
- Reduced motion: sheets appear without sliding; skeleton rows are static.

## Edge cases

- Rapid taps on a chip: the last tap wins; the request in flight is not cancelled, and the final stored value is the
  last one sent.
- A food renamed to a name that exists: refused with the API's text. A food renamed so that #706's learned aliases
  point at it still match, because aliases hold the id.
- A barcode that exists in the library under another name: "Already yours" wins over a lookup; the lookup is not
  made at all when the library already has the code.
- Starter list picked twice, or from two tabs: the second add is `existing`, nothing duplicates.
- A starter food added into a name-only food keeps that food's id, so recipes that use it are not rewired.
- A 20-character-wide serving name in a 375px row wraps; weights over 4 digits are refused by the field.
- Offline: lists show the failed state; no queue (the offline sync queue is out of scope for the whole rebuild).

## Measured

Nothing is measurable yet: there is no running Forage app. The 44px and 375px criteria are checked in `/test` with
`getBoundingClientRect()`, per `stack-web`. The Open Food Facts rate (9 of 10 packaged foods with serving size and
macros) is the spike's (`scratchpad/forage-rebuild/spike/run-off.txt`).

## New tokens

None.
