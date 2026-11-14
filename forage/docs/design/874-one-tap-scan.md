# 874 — Foods: one tap to the barcode camera

Specifies [#874](https://github.com/luketmoss/keel/issues/874), filed alongside epic
[#876](https://github.com/luketmoss/keel/issues/876). The Barcode sheet, its camera view and its outcomes are
[`707-food-library.md`](707-food-library.md) and [`779-barcode-camera-first.md`](779-barcode-camera-first.md), and are
not restated. Tokens and touch targets come from
[`suite-language.md`](../../../ui/docs/design/suite-language.md). Nothing here introduces a token.

## Where the button goes: the header, not a floating button

The prototype sketched a floating **Scan** button over the list. Forage puts every tab's add flow in its header (#709),
and there is room there: measured in the running app (demo, Library · Foods, 375 × 812), the title "Library" ends at
x = 83 and the header actions start at x = 204 (**Add food** 103 px wide, then the 44 px account button), leaving
121 px. A **Scan** button of about 80 px plus the `--space-sm` gap fits without wrapping. A floating button would be
the app's first, would cover the last list row, and would need its own placement rules beside the tab bar.

## The header on Library · Foods

```
Library                    [▣ Scan] [Add food] (D)
```

- **Scan** — `btn btn-primary`, a 20 px camera glyph (stroke `currentColor`, the same drawing style as
  `nav-icons.tsx`) then the word "Scan". Test id `scan-btn`. Accessible name "Scan a barcode" (`aria-label`), since
  the visible word alone is ambiguous out of context.
- **Add food** — becomes `btn btn-secondary`, otherwise unchanged (`add-food-btn`, opens the Add a food sheet with its
  three routes, Scan or enter a barcode among them).
- Both are at least 44 px tall. Shown only on the Foods segment, as **Add food** is today.

## The main path

1. Tap **Scan**. The Barcode sheet opens **with the camera already running**: the "Scan a barcode" camera view
   (#779), live video, the guide frame, "Hold the barcode inside the frame." and its Cancel button. No other tap.
2. A barcode is read: exactly today's outcomes. Found on Open Food Facts → the food form, prefilled (the label check);
   already yours → "That's already in your library as …" with its link; missing → "Open Food Facts doesn't have this
   barcode." with **Type it from the label**.
3. **Cancel** on the camera view returns to the Barcode sheet's typing view (the digits field and **Look it up**), as
   it does today, with focus on **Scan with the camera**. Closing the sheet returns to Foods.

`BarcodeSheet` gains a `startCamera` prop (default `false`); the header path passes `true`. The Add a food sheet's
"Scan or enter a barcode" route still opens it with `false`, so that path is unchanged.

## States and edge cases

- **Camera support is still being checked** (the async `getSupportedFormats`): the sheet shows its typing view for that
  moment and starts the camera as soon as support is confirmed. No spinner; the check takes milliseconds.
- **No camera scanning in this browser** (no `BarcodeDetector`, or no EAN-13 / UPC-A): **Scan** still shows, and opens
  the Barcode sheet's typing view, as today, so the owner can type the digits. The camera never starts.
- **Camera permission denied or the camera fails to start:** the typing view with today's "Couldn't use the camera.
  You can type the barcode instead."
- **Rapid double tap on Scan:** one sheet opens; the second tap lands on the sheet's scrim, not the button.
- **Leaving Library while the camera runs** (tab bar under the sheet is covered by the scrim, so only Back): the sheet
  closes and the camera stops, as today (`stopCamera` on unmount).
- **Demo mode:** the same; lookups go to the demo API.

## Out of scope

A scan button on Eaten's Add sheet, scanning several items in a row, and changing the Barcode sheet's own layout.

## Accessibility

**Scan** is a real `<button>` with an accessible name. Focus moves into the sheet as today; when the camera view
closes, focus goes to **Scan with the camera** (#779's rule).
