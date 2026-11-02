# 776 — Forage: flat fields in More from the label

Specifies [#776](https://github.com/luketmoss/keel/issues/776). Amends the food form paragraph of
[`756-label-nutrition.md`](756-label-nutrition.md) §Food form, and nothing else in it: the sentence "the breakdown
fields indented as in the list" no longer applies. Tokens and spacing come from
[`suite-language.md`](../../../ui/docs/design/suite-language.md). There are no standing documents in
`forage/docs/design/` beyond #702 and #704. Nothing here introduces a token.

## The problem, measured against the code

In the list, the indent has a parent: a "Fat" row with the figure, then Saturated and Trans under it. In the form,
Fat and Carbs are inputs in the core grid, far above, so the section opens with the hint "Per serving" and then
Saturated fat indented one level, with nothing to be indented under. Cholesterol and Sodium (no parent, no indent) then
look outdented against their neighbours.

## Decision: flat, in label order

All seven fields sit at the section's own left edge, one column, in label order:

```
More from the label ▴
Leave any blank that the label doesn't list.
Per serving
Saturated fat g
[                ]
Trans fat g
[                ]
Cholesterol mg
[                ]
Sodium mg
[                ]
Fiber g
[                ]
Sugars g
[                ]
Added sugars g
[                ]
```

`EXTRA_INDENT` and the `is-indented` and `is-indented-2` classes are removed, with their CSS. Labels, order, hints,
`inputmode`, test ids, focus target (Saturated fat from "Add them") and the validation table in 756 are unchanged.

**Why not the other option**, read-only heading rows ("Fat 1.5 g", "Carbs 40 g", or `—` when blank) so the indent has a
parent. Rejected for four reasons:

1. The rows would repeat the core fields' live values a few screens down, so every keystroke in Fat changes two places,
   and a row that reads `—` while the field above holds a half-typed number is confusing.
2. They are not fields in a form of fields: a screen reader and a tap both meet static text between inputs, and the
   heading must be tied to its parts for the grouping to survive without the visual indent.
3. The form is for typing from a label, in label order. The list's heading rows exist to *read* a breakdown; the
   form's job is already done by the labels, which each name their parent ("Saturated fat", "Trans fat", "Added sugars").
4. It adds states (blank, partly typed, invalid) to a surface that is meant to be a flat list of seven inputs.

Fiber and Sugars under "Carbs" are the only ones where the label alone doesn't name the parent, and a person typing a
nutrition label knows where they go. If that proves wrong, subheadings can be added later without touching the fields.

## Unchanged

- The More nutrition list on the food sheet, recipe Nutrition sheet, amount sheet and day card keeps its indent and its
  Fat and Carbs heading rows (756 §One block, used five times).
- Open/closed rule, helper and basis hints, the validation table and its messages, `aria-invalid` and
  `aria-describedby` on the field with an error.

## Edge cases

- **375px:** the single column has no horizontal scroll with an error message showing; an error wraps under its field.
- **Error on Added sugars or Saturated fat:** the message sits directly under that field at the same left edge; there is
  no indent for it to be offset from.
- **Reduced motion and zoom:** nothing animates; at large text sizes the fields simply stack as before.

## Accessibility

Each field keeps its visible `<label>` text, so the accessible name already carries the parent ("Added sugars g"). The
indent was visual only (756 §Accessibility), so removing it changes nothing a screen reader hears. No new elements, so
no new roles or `aria` to add.

## Measurement

The criteria assert alignment, not a size, so there is no measured quantity to cite. `/test` should confirm equal
left edges with `getBoundingClientRect().left` on the seven inputs and the hint, at 375px, per `stack-web` §Verifying a
browser UI.
