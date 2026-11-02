# Forage data rules, for an agent writing them

The rules the Forage library follows. The API enforces most of them and refuses
a write that breaks one; knowing them avoids the refusal.

## Foods

- A food is an **ingredient** or **packaged** (a brand's product with a
  barcode).
- Nutrition is **per 100 g**: kcal, protein, carbs, fat. The four are **all set
  or all blank**. All blank means "no nutrition yet". A label's per-serving
  numbers are converted using the serving's grams.
- A packaged food's **first weight is the label serving**, named with its
  quantity when that isn't 1 (`0.75 cup`, 56 g), and then, when the quantity
  isn't 1, **one unit** (`cup`, 74.7 g). A barcode import returns both; keep
  both as the dry run shows them, because recipe lines in cups find the second
  and the food form's per-serving numbers use the first.
- **Blank means unknown, never 0.** Nothing defaults a nutrition value or a
  weight to 0, and neither do you.
- Seven more values, each per 100 g and each blank or a number of 0 or more,
  independently: saturated fat, trans fat, cholesterol (mg), sodium (mg), fiber,
  sugars, added sugars. They can be set only on a food that has the four. The
  API refuses, naming the fields: saturated plus trans fat over fat, fiber over
  carbs, sugars over carbs, added sugars over sugars, and cholesterol or sodium
  over 100,000 mg. Take them from a label or USDA only when printed; leave them
  blank otherwise. Open Food Facts gives cholesterol and sodium in grams; the
  tools convert them.
- **Named weights** are grams for a count or a measure: `1 medium onion = 150
  g`, `1 cup = 125 g`, `1 clove = 3 g`. They turn a recipe line like "1 medium
  onion" into grams. A food without the weight a line needs makes that line
  partial. Never guess a weight; leave it out.
- `source` is `usda`, `off` (Open Food Facts, set only through a barcode
  lookup), `label` or `manual`. `source_ref` is the FDC id for `usda` and the
  barcode for `off`. `verified` means checked against the label, and shared Open
  Food Facts data needs it.

## Recipes and lines

- Each ingredient line's `text` is **the source's line, verbatim**. Walkthroughs
  cite lines by id, so never tidy the wording.
- `qty` is a number, blank when there is none. `unit` is normalised (`lb`,
  `tsp`, `cup`, `clove`, or blank for a bare count).
- `food_id` is blank until the line is matched. `grams` is an explicit weight
  and overrides conversion. An `optional` line counts toward neither nutrition
  nor shopping.
- Line ids (`L1`, `L2`, ...) are assigned by Forage and stay stable.
- A recipe's nutrition per serving is **partial** when any counted line has no
  matched food, no nutrition, or no weight for its unit. The preview names the
  lines. The seven extra values never make a recipe partial.
- Importing the same link again is refused as a duplicate unless the user
  agrees to a second copy (`allow_duplicate`).

## Writes

- Every write is a dry run until `dry_run` is false.
- Every write returns a call id; `forage_undo` with that id reverses it, all or
  nothing, and is refused if something changed since.
- Writes are never retried: a call that times out may have landed.
