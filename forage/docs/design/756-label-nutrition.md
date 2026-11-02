# 756 — Forage: the rest of the label in the app

Specifies [#756](https://github.com/luketmoss/keel/issues/756), the app half of
[#754](https://github.com/luketmoss/keel/issues/754). The API half, [#755](https://github.com/luketmoss/keel/issues/755),
fixes the field names, the rules and the response shapes used here; this note does not restate them. Tokens, spacing
and touch targets come from [`suite-language.md`](../../../ui/docs/design/suite-language.md), including §Showing data;
the food form, food sheet and recipe Nutrition sheet from [`707-food-library.md`](707-food-library.md); the day card
and amount sheet from [`712-food-log.md`](712-food-log.md). This note amends those three surfaces of 707 and two of 712
and changes nothing else in them. There are no standing documents in `forage/docs/design/` beyond #702 and #704. Every
length is a token; nothing here introduces one.

**The seven** are, in label order: saturated fat, trans fat, cholesterol, sodium, fiber, sugars, added sugars.

## One block, used five times

The food sheet, the recipe Nutrition sheet, the amount sheet and the Eaten day card each show the seven the same way,
in a **More nutrition** block. The food form has its own fields (below).

**The toggle.** A text button, 44px or more, `More nutrition` with a chevron, `aria-expanded`, `aria-controls` the
list. It sits directly under the surface's existing `Protein · Carbs · Fat` line. Collapsed by default. Whether it is
open is remembered on the device for all five surfaces together (one `localStorage` key, read and written in
`try`/`catch`; when storage fails it is collapsed and nothing breaks). Chosen because the owner asked to track these
and would otherwise open it on every screen, while someone glancing at calories is not shown nine more lines.

**The list** (open), in `--text-sm`, tabular figures, a two-column definition list: the name left, the value right.
Fat's and carbs' parts are indented by `--space-4` under a plain-text heading row repeating that macro's figure, so it
reads as a label does:

```
Fat                 48 g
  Saturated fat     15 g
  Trans fat        0.5 g
Cholesterol     210 mg
Sodium        1,840 mg
Carbs              140 g
  Fiber             22 g
  Sugars            48 g
    Added sugars    20 g
```

Added sugars is indented under sugars. The Fat and Carbs heading rows show the same figure as the line above, so the
breakdown is readable without looking back up.

**Values.**
- Grams: as the surface already rounds its macros: whole numbers on the day card and the recipe Nutrition sheet, 0.1
  on the food sheet and the amount sheet, with trailing `.0` dropped. Milligrams: whole numbers, with a thousands
  separator, on every surface.
- **Unknown** is `—` in `--color-text-muted`, never `0`. A value of 0 is shown as `0 g` (trans fat often is 0).
- **At least.** On the day card and the recipe Nutrition sheet, a value whose `unknown` count (`unknown` or
  `per_serving_unknown`) is above 0 and which is not null reads `at least 1,840 mg`. When any value in the list reads
  "at least", one line under the list in `--color-text-secondary`: "At least: some entries don't have this one." (day
  card) or "At least: some ingredients don't have this one." (recipe). This is words, never colour alone, and it does
  not use the `Low` chip, which stays for calories and macros (#712).
- **None known.** When all seven are null, the list is replaced by one line: "None of today's entries has sodium,
  fiber or the rest yet." (day card; other days use #712's `dayPossessive`, "Monday's"), "None of the ingredients has
  sodium, fiber or the rest yet." (recipe), "This food doesn't have sodium, fiber or the rest yet." (amount sheet, food
  entry), "This recipe doesn't have sodium, fiber or the rest yet." (amount sheet, recipe entry).

**Where the block is not shown:** wherever its surface shows no calories: the day card's "Nothing logged" and "All
entries unknown" states, a recipe with "No nutrition yet", a food without nutrition (the food sheet's own warning
banner stays), the day card's Loading and Failed states.

**While updating** (the recipe sheet's and amount sheet's "Updating…"): the list keeps its last figures; only the
existing "Updating…" status speaks.

## Food form (amends 707 §Food form, item 3)

Under the four core fields, a toggle **More from the label**, same style as above, `aria-expanded`. It is open when
the form opens if any of the seven is set on the food, or the Open Food Facts lookup returned any; otherwise closed. Its
state is not remembered: it follows the food.

Inside, seven fields in label order, in the same basis as the core four: **Per serving** for a packaged food with a
label serving (stored per 100 g, shown per serving rounded to 0.1, as the core four), **Per 100 g** otherwise. Labels:
`Saturated fat g`, `Trans fat g`, `Cholesterol mg`, `Sodium mg`, `Fiber g`, `Sugars g`, `Added sugars g`, the
seven fields in one flat column, not indented (amended by [776](776-flat-label-fields.md)). `inputmode="decimal"`, each optional.

Helper under the toggle, `--color-text-secondary`: "Leave any blank that the label doesn't list."

Save is disabled, with the message under the field in `--color-danger-text`, while:

| Condition | Field | Message |
|---|---|---|
| Not a number, or below 0 | that field | "Enter a number, 0 or more." |
| Any of the seven set and the core four blank | first set field | "Needs the calories and macros too." |
| Saturated + trans greater than fat | Saturated fat | "Saturated and trans fat add up to more than fat." |
| Fiber greater than carbs | Fiber | "Fiber is more than carbs." |
| Sugars greater than carbs | Sugars | "Sugars are more than carbs." |
| Added sugars greater than sugars | Added sugars | "Added sugars are more than sugars." |
| Cholesterol or sodium over 100,000 mg per 100 g | that field | "That's more than 100,000 mg per 100 g." |

These are the API's rules (#755), checked in the form so the message sits on the field; the API's refusal still shows
in 707's "Couldn't save" line if one gets through. The comparisons are made on the per-100 g values, so a packaged
food's rounding cannot trip them.

A verified Open Food Facts food whose seven are edited loses `verified`, as an edit of the core four does (707).

**Add the rest** entry point: the food sheet's "Add them" (below) opens this form with the section open and focus on
Saturated fat.

## Food sheet (amends 707 §Food sheet, item 3)

Under the "Per" table, the **More nutrition** block for the food's default weight (its first weight, the label serving
for a packaged food), or 100 g when it has none. A caption line above the list in `--color-text-secondary`:
`Per 1 bar (40 g)` or `Per 100 g`. No "at least" here: a food's value is known or it is not.

When the food has nutrition but none of the seven, the block's toggle is replaced by one line: "Sodium, fiber and the
rest aren't filled in." and a text button **Add them** (44px), which opens the form as above.

The table keeps its four columns; the seven are not added to it, because at 375px it has no room for them.

## Recipe Nutrition sheet (amends 707 §Recipe Nutrition sheet, item 2)

The block goes inside the card, under `Protein · Carbs · Fat`, per serving, from `nutrition.per_serving` and
`per_serving_unknown`. The missing-lines banner and the ingredient table are unchanged: a line whose food lacks sodium
is not a missing line.

## Amount sheet (amends 712 §Amount sheet, item 3)

The block goes in the numbers card, under the macros, from the `dry_run` preview (or the stored entry on open, as 712
says). No "at least": a log entry stores no counts. A partial recipe's existing line, "Some ingredients are left out.",
covers it.

## Day card (amends 712 §Day card)

The block goes under the three macro figures, inside the card's `role="group"`, from the day's `getFoodLogTotals`
values and `unknown`. The `Low` chip and its line stay where they are, after the block, and are unchanged.

## Demo mode

`?demo=true` shows all of this. The demo foods get the seven where a real label would have them: most foods all seven,
at least one food with trans fat and added sugars blank (so "at least" shows on the demo day), and one food with none
(so "Add them" shows). The demo API answers `per_serving_unknown`, the entries' seven and the totals' `unknown` by
#755's rules, the same way it mirrors the existing totals.

## Edge cases

- **An older log entry** (before #755) has all seven null, so a day of only old entries shows "None of today's entries
  has sodium, fiber or the rest yet." and a mixed day shows "at least" where the old entries lack a value.
- **A value of 0** on every entry (trans fat) sums to `0 g`, not `—`.
- **Large figures:** sodium past 9,999 mg keeps its separator (`12,400 mg`) and does not wrap the value column.
- **375px:** the list's two columns fit with no horizontal scroll on every surface; a name never truncates (it wraps).
- **Packaged food with no label serving** in the form: per 100 g, as the core four.
- **Rapid toggle** taps flip the state each time; nothing is fetched.

## Accessibility

- The toggles are buttons with `aria-expanded` and `aria-controls`; 44px or more.
- The list is a `<dl>`. Indentation is visual only; to a screen reader the grouping comes from order, with the
  "Fat" and "Carbs" heading rows read just before their parts. "at least" and `—` are text, with `—` given the accessible name "not known".
- The form's messages are tied to their fields with `aria-describedby`; the fields are `aria-invalid` while wrong.
- Reduced motion: the block opens without animating.
