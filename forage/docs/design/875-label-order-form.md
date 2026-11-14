# 875 — Food form: nutrition in Nutrition Facts order, parts indented

Specifies [#875](https://github.com/luketmoss/keel/issues/875), filed alongside epic
[#876](https://github.com/luketmoss/keel/issues/876). **Supersedes [`776-flat-label-fields.md`](776-flat-label-fields.md)**
for the food form: #776 flattened the seven extra fields because Fat and Carbs sat far above in the core grid, so an
indent had no parent. Here Fat and Carbs are fields in the same list, so the indent has a real parent, which answers
#776's first and third reasons; there are no read-only heading rows, so its second and fourth reasons do not arise.
Validation, conversion and the per-serving / per-100 g rules are
[`756-label-nutrition.md`](756-label-nutrition.md) and [`707-food-library.md`](707-food-library.md) and do not change.
Tokens come from [`suite-language.md`](../../../ui/docs/design/suite-language.md); nothing here introduces one.

Frontend only: `frontend/src/library/food-form.tsx` and its CSS in `global.css`. No API change; what is saved is
byte-for-byte what is saved today for the same typed values.

## Layout

The Nutrition fieldset keeps its Serving / Serving weight pair (packaged only) and its basis hint, then **one list of
eleven fields, always shown**, in the order a US Nutrition Facts panel reads:

```
Nutrition
Serving [⅔ cup      ]   Serving weight (g) [55   ]
Per serving
kcal                    [ 230 ]
Fat g                   [ 8   ]
    Saturated fat g     [ 1   ]
    Trans fat g         [ 0   ]
Cholesterol mg          [ 0   ]
Sodium mg               [ 160 ]
Carbs g                 [ 37  ]
    Fiber g             [ 4   ]
    Sugars g            [ 12  ]
        Added sugars g  [ 10  ]
Protein g               [ 3   ]
kcal, fat, carbs and protein are needed. Leave any other blank that the label doesn't list.
That's 418 kcal per 100 g.
```

- **A row** is the label text on the left and the input on the right: `display: grid`,
  `grid-template-columns: 1fr minmax(0, 40%)`, `align-items: center`, `gap: var(--space-sm)`, rows separated by
  `var(--space-xs)`. The input keeps `class="field"`, `inputmode="decimal"`, and is right-aligned with tabular
  figures so values line up down the column like a label's.
- **Indent:** level-one parts (Saturated fat, Trans fat, Fiber, Sugars) have `padding-left: var(--space-md)` on the
  label, the same indent the More nutrition list uses (`.mn-indent`); Added sugars, level two, has
  `calc(var(--space-md) * 2)`. Only the label is indented; every input sits in the same right column.
- **Weight:** the core four's labels (kcal, Fat g, Carbs g, Protein g) and the two mineral rows (Cholesterol mg, Sodium
  mg) are weight 600, the same as `.field-label` (there is no weight token; this matches the value already in use);
  the indented parts are regular (400), as on a label.
- **Labels keep today's text**, units included, so names match the rest of Forage (food sheet, day card).
- An error message (today's "Needed if you enter any" and the 756 validation messages) sits under its row, spanning
  both columns, left-aligned with that row's label.

**Removed:** the **More from the label ▾** toggle, its open/closed state, the separate "Per serving" hint inside it,
the `nutrient-grid` for the core four, and `.extra-fields` / `.extra-field` CSS that only they use. The hint
"Leave any blank that the label doesn't list." moves under the list, reworded as above.

## Unchanged

- Test ids (`n-kcal`, `n-fat`, `n-carbs`, `n-protein`, `x-satfat_g` … `x-added_sugars_g`), the values each field
  starts with, the save payload, `aria-invalid` and `aria-describedby` on a field in error.
- `focusNutrition` focuses kcal; `focusExtras` (the food sheet's "Add them") focuses Saturated fat, which is now always
  on screen, scrolled into view.
- The Open Food Facts banner, Kind chips, Brand, Name, and the Weights section below.
- Ingredients (per 100 g) get the same list; only the basis hint differs, as today.
- The More nutrition **display** list on the food sheet, Nutrition sheet, amount sheet and day card (756, 864, 870).

## Edge cases

- **375 px:** no horizontal scroll; the longest label ("Added sugars g" with two indents) fits beside a 40% input.
  `/test` measures `scrollWidth <= clientWidth` on the form and that every input's `getBoundingClientRect().left` is
  equal.
- **A food with only the core four:** the seven parts show empty; nothing is collapsed, so there is no "open if any is
  set" rule any more.
- **Large text / zoom:** a label that no longer fits wraps within its column; the input keeps its column.
- **Errors on a parent and its part at once** (e.g. Saturated + Trans more than Fat): each message is under its own
  row, as today.

## Accessibility

Each input keeps its visible `<label>`, so the accessible name still names the nutrient and unit ("Saturated fat g").
The indent is visual only, as in 756. DOM order is the visual order, so Tab walks down the label.
