# 561 — Coffee on the Sip widget

Adds coffee to Thrive Sip as a third one-tap drink, counted in cups (epic
#558). Everything in `524-sip-widget.md` holds: the queue, tap instants,
haptics, midnight, states and the settings screen. This note covers only the
layout and the copy that coffee changes.

## Order and colour

The widget uses the Day view's order (#560): **Water, Coffee, Alcohol**.
Coffee's colour is the app's `--metric-coffee`, `#6f4e37` light and `#c9a27e`
dark, kept as `COFFEE_LIGHT` / `COFFEE_DARK` in `ui/SipColors.kt` next to the
other two. Text on the coffee fill follows the rule the other accents use:
white on the light colour, near-black on the dark one.

## Two cells tall or more (`SMALL`, `WIDE`, `SMALL_TALL`, `WIDE_TALL`)

At 250dp and wider, the figures row and the buttons row each get a third
column:

```
┌──────────────────────────────────────────┐
│ Thrive Sip                updated 3:42 PM │
│ (drop) 48 oz of 64 oz   (cup) 2   (glass) 1 │
│ [██████████████░░░]                       │
│ [   + 4 oz   ]         [ + 1 ]   [ + 1 ]  │
└──────────────────────────────────────────┘
```

- **Weights 2 : 1 : 1** with 8dp spacers (12dp today). At the 250dp minimum,
  that is (250 − 24 padding − 16) = 210dp: water gets 105dp, and coffee and
  alcohol get 52dp each. Water keeps about the 107dp it has today, so its
  figure, goal and bar don't change. The bar still ends where the water
  button does.
- **Coffee and alcohol show the icon and the number only**: "(cup) 2",
  "(glass) 1". A 20dp icon, a 4dp gap and a 20sp bold count of one or two
  digits fit in 52dp, but "2 drinks" does not. The words stay in each figure's
  content description. This changes alcohol's figure from "2 drinks" to "2"
  in this layout. The icon and the button colour beneath it say what the
  number counts.
- **Buttons**: "+ 4 oz", "+ 1" (coffee fill), "+ 1" (alcohol fill), each
  `BUTTON_HEIGHT` (40dp) tall and 52dp or wider. The two "+ 1" buttons are
  told apart by their fill colour, by the icon above each, and by their
  content descriptions.
- **Below 250dp** (`SMALL`, `SMALL_TALL`): water only, as today. Coffee is not
  drawn.

## One cell tall (`SMALL_SHORT`, `WIDE_SHORT`, new `WIDER_SHORT`)

The one-row layout puts each drink's figure and button side by side. At 250dp
it has room for two drinks but not three: three buttons (76 + 48 + 48),
padding and spacers leave 38dp for all three figures. So:

- **Below 360dp**: as today. Water plus, when wide, alcohol. No coffee.
- **A new size, `WIDER_SHORT` = 360dp × 56dp**: water's figure ("48 oz",
  without "of 64 oz" in this row) and "+ 4 oz" (76dp), then coffee's icon and
  count and "+ 1" (48dp), then alcohol's icon and count and "+ 1" (48dp), with
  8dp spacers. That leaves 360 − 24 − 172 − 16 = 148dp for the figures, which
  need about 69 + 36 + 36 = 141dp.

A short widget under 360dp wide has no coffee button. This is deliberate.
Resizing it wider gives one. The default 4×2 widget always has one.

## Copy and accessibility

| Item | Text |
|---|---|
| Coffee figure (visible) | "2" (icon carries the meaning) |
| Coffee figure content description | "2 cups of coffee" / "1 cup of coffee" / "0 cups of coffee" |
| Alcohol figure (visible, three-column layouts) | "2" |
| Alcohol content description | unchanged: "2 alcoholic drinks" |
| Coffee button | "+ 1", content description "Add one cup of coffee" |

## States

As 524, for coffee too:

| Case | Coffee shows |
|---|---|
| Loading | no figure (the "Loading…" headline as today); the button works and queues |
| Not configured | the button is disabled under "Set up Thrive Sip" |
| Offline | today's cups plus queued coffee taps; the "N queued" count includes them |
| Key rejected | taps keep queueing |
| An API with no `coffee_cups` (before #560's deploy) | counts from 0 plus queued taps; the totals read does not fail |

## Deploy order

The outbox sends oldest first and stops at the first drink that fails. A
coffee tap sent to an Apps Script deployment that doesn't accept `coffee` yet
would fail every time and hold up every later water and alcohol tap. **#560's
Apps Script deploy must be live before this build is installed.** The PR says
so at the top.

## New tokens

None in the frontend. `COFFEE_LIGHT` / `COFFEE_DARK` mirror `--metric-coffee`
from #560, and `ic_coffee.xml` is a vector drawable of #560's cup icon.
