# Nutrition sources

Which source wins for which food, and how each is recorded. Check them in this
order.

| Food | Source | Recorded as |
|---|---|---|
| Already in the library with nutrition | the library's | nothing to add |
| On the starter list (about 75 USDA SR Legacy foods) | the starter list, through `starter_id` | the starter list's own `usda` and FDC id |
| Packaged, barcode and label photo agree | Open Food Facts | `source` off, `source_ref` the barcode, `verified` true |
| Packaged, barcode and label photo differ | the label | `source` label, not verified, barcode kept |
| Packaged, barcode only | Open Food Facts | `source` off, not verified |
| Packaged, label photo only | the label | `source` label |
| An ingredient not on the starter list | USDA FoodData Central, **Foundation or SR Legacy only** | `source` usda, `source_ref` the FDC id |
| Nothing fits | none | added without nutrition, or the user's own values as `manual` |

## Rules for each

- **The label wins over Open Food Facts.** Open Food Facts is shared and can be
  wrong. `verified` is set only when each of the four core values is within 5%
  or 1 unit (kcal or g), whichever is larger, of the label's, both per 100 g.
- **USDA is for ingredients, and only Foundation and SR Legacy entries.** Branded
  and survey entries are other people's guesses. Show the FDC description
  verbatim, the FDC id and the per-100 g values before saving; a near-miss such
  as "Spices, poultry seasoning" for herbes de Provence must be visible to the
  user. Raw versus cooked matters: pick the entry that matches the line.
- **A label's serving needs grams.** Volume is not weight; ask rather than
  assume.
- **Never write 0 for a value you could not find.** Leave it blank.
- The seven extra values (saturated and trans fat, cholesterol, sodium, fiber,
  sugars, added sugars) are taken wherever the source prints them, each only
  when shown.
