# 524 — The Thrive Sip widget

Part of #518. A native Android widget and a one-screen settings app, from the "Home screen widget" board (widgetStyle **live**) of the Thrive Sip canvas. The rejected "shortcuts" style is not built.

## Layout (4×2, resizable wider)

```
┌────────────────────────────────────────┐
│ Thrive Sip                    updated 3:42 PM │
│ 💧 48 oz of 64 oz        🍷 2 drinks    │   (icons are drawn glyphs, not emoji)
│ [██████████████░░░░░░░]                │
│ [   + 4 oz   ]          [   + 1   ]    │
└────────────────────────────────────────┘
```

- Left: water. Total in oz at the large size, "of 64 oz" smaller, bar beneath, "+ 4 oz" button. Right: alcohol count and "+ 1" button. Buttons ≥48dp tall.
- Colours follow the app: water blue, alcohol amber, on the system's light or dark widget surface (Material You colours where available, fixed fallbacks otherwise).
- "updated 3:42 PM" is the last good read; it turns to "offline · 2 queued" when taps are waiting.
- Tapping the title/body (not a button) opens `https://luketmoss.github.io/keel/thrive/`.

## Main path

1. Add the widget; with URL and key set it reads `getDrinkTotals` and draws.
2. Tap "+ 4 oz": the total and bar move at once, a short haptic fires, the drink is saved to the local queue with a new UUID and the tap instant, and a send is scheduled immediately. On success the widget re-reads and redraws; on failure the drink stays queued.
3. Same for "+ 1".
4. At local midnight (Denver) the widget redraws with zeros from the app's own alarm and re-reads on the next refresh.

## States

| Case | Widget shows |
|---|---|
| Not configured | "Set up Thrive Sip" over both buttons, buttons disabled; tapping opens settings |
| First read pending | "Loading…" in place of figures; buttons work and queue |
| Normal | figures, "updated <time>" |
| Offline / send failing | figures including queued taps, "offline · N queued" |
| Key rejected | "Key rejected — open Thrive Sip"; taps keep queueing |
| Over goal | bar full, figure continues; colour unchanged |
| Goal unknown | "48 oz" with no "of …", bar hidden |
| Very small size | water figure and its button only |

## Edge cases

- **Rapid taps**: each is its own queue entry, none merged; the button is never disabled.
- **Process killed / reboot**: the queue is in app storage and resumes on the next WorkManager run; the widget redraws after boot.
- **Clock/timezone**: the stamp is the instant (UTC); the server files it by Denver date. A tap just before midnight stays on its day even if sent after.
- **Delivery after a new day**: the queued tap keeps its original time and day.
- **Long outage**: no cap on the queue; no discard.

## Settings screen

Title "Thrive Sip"; fields "API URL" and "Key" (masked, with a show toggle); "Test connection" and "Save". Results: "Connected — 48 oz today", "Key rejected", "Can't reach the server", "That doesn't look like a URL". Nothing else.

## Copy

"Thrive Sip", "+ 4 oz", "+ 1", "Set up Thrive Sip", "Loading…", "offline · 2 queued", "Key rejected — open Thrive Sip", "Test connection".

## Accessibility

Buttons have content descriptions "Add 4 ounces of water" and "Add one alcoholic drink"; the totals read as "Water 48 of 64 ounces" and "2 alcoholic drinks". Text meets 4.5:1 on both themes.
