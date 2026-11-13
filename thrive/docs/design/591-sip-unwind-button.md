# 591 — Unwind on the Sip widget

Adds Unwind to Thrive Sip as a fourth one-tap entry: 5 mg per tap (epic #586).
Everything in `524-sip-widget.md` and `561-sip-coffee-button.md` still holds:
the queue, tap instants, haptics, midnight, states, the settings screen, and the
fixed count columns. This note covers only where the fourth column fits and the
copy. As in #590, **Unwind is an alias, and the alias is the whole name**.

## Order and colour

The widget uses the Day view's reading order (#590): **Water, Coffee, Alcohol,
Unwind**. The colour is #590's `--metric-unwind`: `#5e7c62` light and `#9cbf9f`
dark, kept as `UNWIND_LIGHT` / `UNWIND_DARK` in `ui/SipColors.kt`. Text on the
fill follows the accent rule: white on the light colour (4.6:1) and near-black
on the dark one. The icon is `ic_unwind.xml`, #590's crescent moon as a stroked
vector.

## Two cells tall or more: a fourth column from 310dp

#561 made coffee and alcohol fixed `COUNT_COLUMN` (52dp) columns, with
`COLUMN_GAP` (8dp) between columns, and gave water the rest. Water needs about
105dp for "48 oz of 64 oz" and its bar. A fourth fixed column fits once:

  width − 24 (padding) − 3 × 8 (gaps) − 3 × 52 (counts) ≥ 105
  → width ≥ **309dp**

```
┌──────────────────────────────────────────────────────┐
│ Thrive Sip                            updated 9:42 PM │
│ (drop) 48 oz of 64 oz  (cup) 2  (glass) 1  (moon) 10  │
│ [██████████████░░░]                                   │
│ [   + 4 oz   ]         [ + 1 ]  [ + 1 ]    [ + 5 ]    │
└──────────────────────────────────────────────────────┘
```

- Two new responsive sizes, `WIDEST` = 310dp × 100dp and `WIDEST_TALL` =
  310dp × 150dp, go into `SizeMode.Responsive`. At those sizes the figures row
  and the buttons row each gain the Unwind column, the same 52dp as coffee's.
  Water takes the rest: 106dp at 310dp, and more on wider widgets.
- **The Unwind figure is the icon and the number only**: "(moon) 10". The "mg"
  goes in the content description, the way coffee's "cups" does. Two digits fit
  the 52dp column. A figure of 100 or more could clip, and that's accepted
  (that would be 20 taps in a day).
- **Button**: "+ 5" on the Unwind fill, `BUTTON_HEIGHT` (40dp) tall, 52dp wide.
  "+ 5 mg" doesn't fit 52dp at the button's text size. The fill colour, the moon
  above it and the content description tell it apart.
- **Below 310dp** (`SMALL`, `WIDE`, `SMALL_TALL`, `WIDE_TALL`): unchanged. Water,
  coffee and alcohol from 250dp, water only below. No Unwind is drawn.

A two-row widget narrower than 310dp has no Unwind button. This is deliberate,
the same trade #561 made for coffee. Resizing the widget wider adds it. Whether
the default 4×2 placement reports 310dp or more depends on the launcher, which
is one of the owner's after-install checks.

## One layout at every height

The one-row layout (#524, #561) is gone. Next to the stacked one it read as a
different widget, and its 48dp buttons cut "+ 1" to "+". Every size now draws
the stacked layout: figures, bar, then buttons.

- The base sizes are declared 0dp tall (`SMALL`, `WIDE`, `WIDEST`), so a
  widget of any height gets them; the 150dp sizes add the title row.
- `minResizeHeight` is 90dp, two cells on a phone, so the stacked layout
  (about 92dp) is never squeezed into one.
- Wider than 310dp, only water widens. The count columns stay 52dp.

## Buttons are pills, not Glance's `Button`

Glance's `Button` keeps its own horizontal padding, which left "+ 5" no room in
a 52dp column ("5" is wider than "1") and drew a bare "+". Every button is now a
`Box` filled with the accent, corner radius half its 40dp height, with the
label centred at 14sp medium on one line. Disabled, it takes the track colour
and the secondary text colour and isn't clickable.

## Copy and accessibility

| Item | Text |
|---|---|
| Unwind figure (visible) | "10" (the moon carries the meaning) |
| Unwind figure content description | "10 mg of Unwind" / "5 mg of Unwind" / "0 mg of Unwind" |
| Unwind button | "+ 5", content description "Add 5 mg of Unwind" |

## States

As 561, for Unwind:

| Case | Unwind shows |
|---|---|
| Loading | no figure (the "Loading…" headline); the button works and queues |
| Not configured | the button is disabled under "Set up Thrive Sip" |
| Offline | today's mg plus 5 for each queued Unwind tap; "N queued" counts them |
| Key rejected | taps keep queueing |
| An API with no `unwind_mg` (before #590's deploy) | counts from 0 plus queued taps; the totals read does not fail |

## Deploy order

The outbox sends oldest first and stops at the first entry that fails. An
Unwind tap sent to an Apps Script deployment that doesn't accept `unwind` would
hold up every later tap. **#590's Apps Script deploy must be live before this
build is installed.** The PR says so at the top.

## New tokens

None in the frontend. `UNWIND_LIGHT` / `UNWIND_DARK` mirror `--metric-unwind`
from #590.
