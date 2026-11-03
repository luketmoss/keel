# 787 — Foods by kind

Specifies [#787](https://github.com/luketmoss/keel/issues/787). Amends Library → Foods from
[`707-food-library.md`](707-food-library.md) §Foods list, which drew both cards on one scroll, Packaged first.
Tokens from [`suite-language.md`](../../../ui/docs/design/suite-language.md); no new tokens.

## Layout

Under the Recipes | Foods switch, top to bottom:

1. "Search foods" (unchanged: shown from 8 foods).
2. A chip row, `role="group"`, `aria-label="Show"`: **Ingredients (n)**, **Packaged (n)**, in that order. The
   `chip` look and the `sort-chips` row from Recipes (one line, no wrap, `--space-md` below), `aria-pressed` on
   the chosen one. `n` is the kind's whole count in the library, not the search's.
3. One card, the chosen kind, sorted by name, rows as #707. With the chips showing, the card has no `card-label`
   heading (the pressed chip already says it); it keeps `aria-label` "Ingredients" or "Packaged".
4. The status line (`foodsNotice`), unchanged.

Why chips and not a third segment on the top switch: the top switch follows the header's button (Import / Add food)
and owns the Foods empty state; the chips are the same pattern Recipes already uses for its sort, one level down.

Why Ingredients first and default: they are what recipes and most logging use, and the half that was getting
buried.

## States

| State | Shows |
|---|---|
| Empty, loading, failed | As #707; no chips |
| Only one kind in the library | No chips. That kind's card, with its #707 heading and count (`Ingredients (75)`) |
| Both kinds | Chips and the chosen kind's card |
| Search typed | No chips. Matches of both kinds as #707's cards, **Ingredients** first then **Packaged**, each headed with the match count; a card with no matches is not drawn. No match at all: #707's "No food matches "<text>"." and **Add "<text>"** |
| Search cleared | The chips again, with the chip that was pressed before |

## Behaviour

- The chosen kind is a session signal next to `librarySection` (`foodsKind`, `'ingredient' | 'packaged'`,
  default `'ingredient'`), reset by `_resetFoods`. It survives the Recipes switch and other tabs; a reload
  forgets it.
- A food counts as packaged when `kind === 'packaged'`; anything else is an ingredient (as #707's split).
- Saving a food from the label form (new, from a barcode, or an edit) sets the chip to the saved food's kind, so
  the "Saved …" line names something visible. Adding from the starter list sets **Ingredients**.
- Deleting the last food of the chosen kind leaves one kind: the chips go and the other card shows with its
  heading. The signal keeps its value; if packaged foods come back, the chip pressed is whatever it was.

## Edge cases

- Pressing the chip already pressed does nothing.
- A search typed while **Packaged** is pressed still finds ingredients; the pressed chip is unchanged when the
  search clears.
- Fewer than 8 foods: no search field, chips still shown when both kinds exist.

## Copy

Chips: `Ingredients (12)`, `Packaged (3)`. Group label (screen readers): "Show". No other new strings.
