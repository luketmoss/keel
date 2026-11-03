# 780 — Sheet header controls don't wrap

Specifies [#780](https://github.com/luketmoss/keel/issues/780). Amends the sheet header from
[`706-recipe-import.md`](706-recipe-import.md) and its use in the food form ([`707-food-library.md`](707-food-library.md)).
Tokens from [`suite-language.md`](../../../ui/docs/design/suite-language.md); no new tokens.

## What's wrong (measured)

Demo mode, 375 × 812, Library → Foods → Hilltop Dairy Plain yogurt → **Edit**. `.sheet-header` is a flex row
(`gap: var(--space-sm)`): **Cancel** (text button), `h2` "Edit Hilltop Dairy Plain yogurt", **Save** (`btn
btn-primary`). Computed: the `h2` is 202.6 px wide; **Save** is 60.6 px wide and 46.8 px tall, its text broken
"Sav / e". Cause: `.btn` has `overflow-wrap: anywhere`, the header controls have `flex-shrink: 1`, and the `h2` is
`flex: 0 1 auto`, so the button gives up width before the title does.

## Behaviour

- Header controls (`headerStart`, `headerEnd`, the close button) keep their natural width: they never shrink and
  their text never wraps (`flex-shrink: 0`, `white-space: nowrap` on direct button children of `.sheet-header`).
- The title takes the remaining width (`flex: 1 1 auto; min-width: 0`) and wraps onto as many lines as it needs,
  word by word; no ellipsis. The header's height grows with it, and the controls stay vertically centred
  (`align-items: center`, unchanged).
- **Save** is one line, height `--touch-target`, for both "Save" and "Saving…". Its disabled look (half opacity)
  is unchanged.
- Short titles ("New food", "Barcode") look as before: the title still sits between the controls, start-aligned.

## Edge cases

- A single word longer than the space left (a pasted 40-character brand) breaks inside the title, never inside a
  button: the title keeps `overflow-wrap: anywhere`.
- Sheets with only a close button are unaffected beyond the close button not shrinking, which it already didn't.

## Copy

None.
