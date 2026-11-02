# 757 — Day: the rest of the label on the Food card

Specifies [#757](https://github.com/luketmoss/keel/issues/757). Amends the Food card of
[`714-day-food-card.md`](714-day-food-card.md) and changes nothing else in it. The values, their names and the
`unknown` counts are Forage's, fixed by [#755](https://github.com/luketmoss/keel/issues/755); how they read is taken
from Forage's own day card, [`forage/docs/design/756-label-nutrition.md`](../../../forage/docs/design/756-label-nutrition.md)
§One block, so the owner reads the same figures the same way in both apps. Tokens are the suite's
(`ui/tokens/suite.css`, which Thrive's `global.css` imports). There are no standing documents in
`thrive/docs/design/`. Nothing here adds a token.

**The seven** are, in label order: saturated fat, trans fat, cholesterol, sodium, fiber, sugars, added sugars. From
each day of `getFoodLogTotals`: `satfat_g`, `transfat_g`, `cholesterol_mg`, `sodium_mg`, `fiber_g`, `sugars_g`,
`added_sugars_g`, each a number or `null`, and `unknown`, an object with the same seven keys, each a count of that day's
entries with calories but not that value. Thrive adds nothing up, as #714 says.

## The block

A **More nutrition** block in the card, directly under the `Protein · Carbs · Fat` line (`.food-macros`) and above the
day's note (`Low` line, or none). The `Low` chip and its line are unchanged and keep meaning calories and macros.

**The toggle.** A text button, at least the app's 44px tap minimum, `More nutrition` and a chevron (pointing down
closed, up open), `aria-expanded`, `aria-controls` the list, styled as the card's Open Forage link (the Quiet button family of #404, which Thrive's tests hold every button to). Collapsed by default.
Whether it is open is remembered on the device in `localStorage` key `thrive.foodMore` (`'1'` open, anything else
closed), read and written in `try`/`catch`; when storage fails it is collapsed and nothing breaks. It is the same
for every day: open it on Monday and Tuesday's card opens too. Signing out leaves it (it holds no data).

Why collapsed and remembered rather than always open: it matches Forage's day card, which the owner uses for the same
numbers, and the Day screen is a stack of cards where nine more lines push Drinks below the fold. The owner opens it
once and it stays open.

**The list** (open), a `<dl>` in `--text-sm`, tabular figures, two columns: the name left, the value right-aligned.
Fat's and carbs' parts are indented by `--space-md` under a heading row that repeats that macro's figure; added sugars
is indented a second step under sugars:

```
Fat                 48 g
  Saturated fat     15 g
  Trans fat          0 g
Cholesterol      210 mg
Sodium         1,840 mg
Carbs              140 g
  Fiber             22 g
  Sugars            48 g
    Added sugars    20 g
```

Names in `--color-text-secondary`, values in `--color-text`. The Fat and Carbs rows show the day's `fat_g` /
`carbs_g` exactly as the macro line does (`—` when it does).

**Values.**
- Grams in whole numbers, as the card's macros are; milligrams in whole numbers with a thousands separator
  (`wholeNumber`, `food-week.ts`). Forage's totals are to 0.1 and are rounded as the macros are.
- **Unknown** (`null`) is `—` in `--color-text-muted`, never `0`. A real 0 is `0 g` (trans fat often is).
- **At least.** A value that is not null and whose `unknown` count is above 0 reads `at least 1,840 mg`. When any row
  reads "at least", one line under the list in `--text-sm` `--color-text-secondary`: "At least: some items don't have
  this one." Words, never colour alone. It does not use the `Low` chip.
- **None known.** When all seven are null, the list is replaced by one line in `--color-text-secondary`: "None of
  today's items has sodium, fiber or the rest yet." (past day: "None of Monday's items has sodium, fiber or the rest
  yet.", with #714's `weekdayName`). The toggle stays, so the line is behind it like the list.

Thrive says "items" where Forage says "entries": the card's own count and lines already say items (#714).

## When the block is shown

| Case | Block |
|---|---|
| Logged, with calories | Shown, as above |
| Partial (`Low`) | Shown; values read "at least" wherever their `unknown` says so. The `Low` line stays after the block |
| Nothing logged on the day shown | Not shown (#714's "Nothing logged" state is unchanged) |
| Every entry lacks nutrition | Not shown (#714's "None of … has nutrition yet" state is unchanged) |
| Loading, failed, demo mode loading | Not shown; #714's skeleton and failed state are unchanged |
| **Forage does not send the seven yet** (its API deployed before #755, or the reply's day lacks any of the seven keys or `unknown`) | **Not shown, no toggle.** The card is exactly #714's. Not an error |
| A seven value or `unknown` count present but not a number (or `null` for a value) | Treated as Forage not sending them: no block. The core figures still show; this never turns the card into its failed state |
| Demo mode | Shown, from demo data (below) |

The last two rows matter because Thrive's build and Forage's Apps Script deploy separately (Apps Script is the owner's
step), so for a while Thrive may meet a Forage that sends only the four. The parser (`parseDay`, `api/forage-food.ts`)
keeps refusing a malformed core figure as today; the seven are optional on the `FoodDay` (`label?: FoodLabel`) and
parsed all-or-nothing.

## Transitions

- Toggle: opens and closes at once, no animation (so nothing to reduce under reduced motion). Rapid taps flip it each
  time; nothing is fetched.
- A refresh that changes the figures: the block shows the new ones. The existing live-region announcement ("Food
  updated: N kcal") is unchanged and does not read the seven.
- Moving between days: the card remounts per date (#714); the toggle's state comes from storage, so it carries over.

## Demo mode

`demoFoodDays` (`state/food.ts`) gives its days the seven and `unknown`: today with all seven known except added
sugars, which is known with `unknown.added_sugars_g` = 1 (so "at least" and its line show on the demo day); the
partial day with at least two values "at least"; one other logged day with all seven null (so "None of …'s items has
sodium, fiber or the rest yet." can be seen by moving to it).

## Edge cases

- **Older entries** (logged before #755) lack the seven; Forage counts them in `unknown`, so a mixed day reads "at
  least" and a day of only old entries reads "None of …".
- **Large figures:** sodium past 9,999 mg keeps its separator (`12,400 mg`) and the value column does not wrap; a name
  wraps rather than truncating. No horizontal scroll at 375px.
- **A value above its parent** (sugars over carbs) cannot come from Forage, which refuses it per food; Thrive shows what
  it is sent and checks nothing.
- **Midnight rollover, token expiry, offline:** #714's handling, unchanged.

## Copy

"More nutrition", "Fat", "Saturated fat", "Trans fat", "Cholesterol", "Sodium", "Carbs", "Fiber", "Sugars",
"Added sugars", "g", "mg", "at least", "At least: some items don't have this one.", "None of today's items has
sodium, fiber or the rest yet.", "None of Monday's items has sodium, fiber or the rest yet.".

## Accessibility

- The toggle is a `button` with `aria-expanded` and `aria-controls`; 44px or more; its chevron is `aria-hidden`.
- The list is a `<dl>`, inside the card's `section`. Indentation is visual only; the Fat and Carbs rows are read just
  before their parts. "at least" is text; `—` has the accessible name "not known" (a visually hidden span, as #714's
  strip names its days).
- Contrast: names and the "at least" line are `--color-text-secondary`, `—` is `--color-text-muted`, both already
  checked on `--color-surface` by the suite.

## Not here

The seven in the week strip, a second strip for sodium or fiber, goals or limits ("under 2,300 mg") and colouring
against them, % Daily Value, mono- and polyunsaturated fat, a Trends page for food, and any change to what `Low`
means.
