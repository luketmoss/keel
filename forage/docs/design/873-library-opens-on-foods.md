# 873 — Library opens on Foods

Specifies [#873](https://github.com/luketmoss/keel/issues/873), filed alongside epic
[#876](https://github.com/luketmoss/keel/issues/876). The segments are already **Foods · Usuals · Recipes** in that
order (#887, [`887-library-usuals.md`](887-library-usuals.md)); only which one is chosen on open changes. Nothing here
introduces a token.

## Decision

`librarySection` in `frontend/src/library/foods-store.ts` starts as `'foods'`, and `_resetFoods` (sign-out, tests)
resets it to `'foods'`. So the first visit to Library after the app loads shows Foods, with the header's Foods buttons
(#874's **Scan** and **Add food**).

**Remembered for the session, not across launches.** Within one load the last segment chosen stays chosen, as today:
leaving Library for Eaten and coming back shows the same segment. A reload or a fresh launch starts on Foods again.
Chosen over remembering across launches (`localStorage`), which the prototype's note suggested, because one visit to
Recipes would then make every later launch open on Recipes, which is the extra tap this issue removes. Foods is used
far more, so a fixed start beats a remembered one.

## Unchanged

- Log mode's Leave and Close (#708) still switch Library to **Recipes** and reopen the recipe's sheet; the Import
  flow's save still lands on Recipes. Those are explicit returns to a recipe, not an open.
- The Foods chips (Ingredients · Packaged, #787) keep their own session memory, starting on Ingredients.
- Segment buttons, counts, `aria-pressed`, and the Usuals editor (#887) are untouched.

## Edge cases

- **No foods yet:** Foods shows its existing empty state (with **Add food** and the starter list) rather than switching
  to a segment with content.
- **Foods failed to load:** its existing error and **Try again**, on Foods.
