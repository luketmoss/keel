# 520 — Water and Alcohol cards on the Day view

Part of #518 (Thrive Sip). Two cards after `training` and `sleep`, before the metric tiles, using #485's tokens and the card pattern of #489/#490. Data and rules come from #519; the card only draws it. Prototype: the "In-app Day cards" board of the Thrive Sip canvas.

## Layout

```
(drop) Water                              today
48 oz  of 64 oz
[██████████████░░░░░░░░░░]
[ + 4 oz ]
 3:42 PM   4 oz        ⋯
 1:10 PM   4 oz        ⋯
```
```
(glass) Alcohol                           today
2 drinks
[ + 1 drink ]
 9:05 PM   1 drink     ⋯
```

- Title and icon in the colour of the metric family; a `--metric-water` token is added to `global.css`, in light and dark; alcohol uses `--metric-alcohol`. Right side: "today", or the weekday for a past day (`--text-xs`, `--color-text-muted`).
- Figure at `--figure-lg`, "of 64 oz" in `--text-sm` `--color-text-secondary`. Alcohol shows the count only.
- Progress bar `--drink-bar-height`, `--radius-sm`, fill = total ÷ goal capped at 100%.
- The button is full width, at least the app's tap-target minimum, labelled "+ 4 oz" / "+ 1 drink". Today only.
- Entries newest first: time (`clock12`), amount, and a `⋯` button (tap-target minimum) opening a small menu: "Edit time", "Delete".
- Water amounts: ml ÷ 29.5735, one decimal, trailing `.0` dropped ("4 oz", "3.9 oz" never appears for a quick-add: 118 ml reads "4 oz").

## Main path

1. Open today: both cards show totals from `getDrinks` (today).
2. Tap "+ 4 oz": the total, bar and list update at once (entry with the current time, pending), `logDrink` runs; on success the pending mark clears.
3. Tap "⋯ → Edit time": an inline time field opens in the entry (native time input); "Save" calls `updateDrinkTime`, the list re-sorts.
4. Tap "⋯ → Delete": the in-app confirm (#403): "Delete this drink?" / "Delete" / "Cancel". Delete removes it and lowers the total.
5. Goal: Settings has a "Daily water goal" field in oz (whole numbers 8–337, i.e. 250–10000 ml); saving calls `updateSetting`; the Water card uses it on the next render.

## States

| Case | Shows |
|---|---|
| Loading | both cards as skeletons, buttons disabled |
| Read failed | the app's `PanelStatus` error with "Try again"; buttons disabled |
| Today, no drinks | "0 oz of 64 oz", empty bar, line "Nothing logged yet." |
| Alcohol, none | "0 drinks", line "Nothing logged yet." |
| Goal reached | bar full, figure in `--color-success`; text "of 64 oz" unchanged |
| Over goal | bar full, figure continues ("72 oz of 64 oz") |
| Pending entry | entry shown at reduced opacity with "Saving…" until acknowledged |
| Log failed | the pending entry is removed, total restored, inline error "Couldn't save that drink. Try again." |
| Delete failed | entry stays, inline error "Couldn't delete that drink." |
| Past day | entries, totals, ⋯ menu; no add button; caption "Drinks can only be added today." |
| Future day | not mounted |
| Demo mode | in-memory store, same behaviour |

## Edge cases

- **Rapid taps**: each tap creates its own entry with its own `id`; the button is never disabled while a request is in flight.
- **Edit time past midnight**: a time input is limited to the same date; there is no way to move a drink to another day.
- **Edit to the same time**: no request, menu closes.
- **Goal changed on another device**: the value shown is whatever the last read returned; no push.
- **Offline in the SPA**: the add fails like any API failure (the queue is the widget's job).

## Copy

"Water", "Alcohol", "+ 4 oz", "+ 1 drink", "Nothing logged yet.", "Edit time", "Delete", "Delete this drink?", "Daily water goal", "Drinks can only be added today."

## Accessibility

- Buttons: "Add 4 ounces of water", "Add one alcoholic drink". The totals are announced in a polite live region ("Water 52 ounces of 64"). The bar is `role="progressbar"` with `aria-valuenow`/`aria-valuemax` in oz.
- The `⋯` button is "More actions for the 3:42 PM water entry".
- Colour is never the only signal: goal reached also adds a check icon.

## Not here

A per-type picker for alcohol, a goal for alcohol, quick-add choices other than 4 oz.

## New tokens

In `global.css`, light and dark where a colour:

- `--metric-water` — the water metric colour, a blue distinct from `--metric-sleep`; used by the card title, icon, bar fill and the Trends bars (#521). Final values are chosen against `--color-surface` for 4.5:1 text contrast in both themes.
- `--metric-alcohol` — the alcohol metric colour, an amber; same use and contrast rule.
- `--drink-bar-height` — 12px, the height of the water progress bar, matching the sleep stage bar (#490).
