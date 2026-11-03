# 781 — Brand and name read as two things

Specifies [#781](https://github.com/luketmoss/keel/issues/781). Amends the Foods list row and food sheet in
[`707-food-library.md`](707-food-library.md), the Add sheet rows in [`712-food-log.md`](712-food-log.md) and the
shop add sheet in [`719-trip-added-items.md`](719-trip-added-items.md). Tokens from
[`suite-language.md`](../../../ui/docs/design/suite-language.md); no new tokens.

## Why

`Hilltop Dairy Plain yogurt` — one weight, one colour, a single space between brand and product. In a list of
pantry items the eye can't find where the product starts.

## The name in a row

Where a food is a row's title, the title is two spans on one line:

1. the **brand**, `--color-text-secondary`, weight 400, followed by a normal space;
2. the **name**, the row title's existing style (weight 600, `--color-text`, or `status-muted` where the row is
   muted).

Example: "Hilltop Dairy" in secondary text, then **Plain yogurt**. Both spans wrap together as one line of
text (`overflow-wrap: anywhere` as today); the brand is not truncated. A food with no brand (blank or whitespace)
renders the name alone, identical to today.

Applies to:

| Surface | File |
|---|---|
| Library → Foods, line one of each row | `library/foods-list.tsx` |
| Eaten → Add, food results (recipes are unchanged) | `eaten/add-sheet.tsx` |
| Shop → add sheet, food rows | `shop/add-sheets.tsx` |

Chosen over a separator character (`Hilltop Dairy · Plain yogurt`) or a second line: weight and colour separate them
without adding length, and line two already carries kcal and chips.

## The food sheet

The title (`h2`) is the name only: "Plain yogurt". The brand leads the existing hint line under it:
`Hilltop Dairy · Packaged food · Open Food Facts`. Without a brand the hint is as today
(`Packaged food · Open Food Facts`, `Ingredient · USDA`).

## Unchanged (plain text)

`displayName()` keeps returning `brand name` and is still used for search matching, sorting, aria labels ("Hilltop
Dairy Plain yogurt, 149 kcal a cup"), the food form's `Edit …` title, delete confirmations and notices ("Saved …").
Row buttons keep the plain text as their accessible name, so a screen reader hears one name.

## Copy

No new strings; the hint separator is the existing ` · `.
