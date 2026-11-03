# 779 — Barcode sheet leads with the camera

Specifies [#779](https://github.com/luketmoss/keel/issues/779). Amends the Barcode sheet in
[`707-food-library.md`](707-food-library.md); everything there not named here stands. Tokens from
[`suite-language.md`](../../../ui/docs/design/suite-language.md); no new tokens.

## Why

Opening the sheet focused the Barcode field, so the phone keyboard rose and covered **Scan with the camera**. The
owner scans nearly every time, often a dozen foods in a row, and dismissed the keyboard on every one.

## Layout and focus

Three cases, decided when the sheet opens:

| Browser | Order (top to bottom) | Focus on open |
|---|---|---|
| `BarcodeDetector` with `ean_13` and `upc_a` | **Scan with the camera** (secondary, full width) · Barcode field · **Look up** · status | **Scan with the camera** |
| `BarcodeDetector` present, formats lacking | Barcode field · **Look up** · status | nothing inside the form (the sheet panel itself), so no keyboard |
| No `BarcodeDetector` | Barcode field · **Look up** · status (as #707) | the Barcode field |

- The Scan button keeps its #707 style (`btn btn-secondary btn-block`) and copy; it does not become primary,
  because **Look up** stays the primary for a typed code. The gap between Scan and the field is `--space-sm`, the
  same as between the other controls.
- `getSupportedFormats()` resolves after the first render. While it is pending, when `BarcodeDetector` exists, the
  field is **not** autofocused and the sheet panel holds focus. When it resolves with support, the Scan button is
  drawn and takes focus; without support, focus stays on the panel.
  Chosen over drawing the Scan button optimistically and removing it, which would flash a button that then
  vanishes.
- Tapping the field focuses it and opens the keyboard as normal; typing, Enter and **Look up** behave as #707.

## Camera view

Unchanged. **Cancel** (or Escape) returns to the sheet with **Scan with the camera** focused, so a second attempt is
one tap. A camera error ("Couldn't use the camera. You can type the barcode instead.") also returns focus to the
Scan button, and the message stays under the controls as today.

## After a scan

Unchanged: the code fills the field and the lookup runs. "Already in your library", "doesn't have this barcode" and
failure messages appear as #707; none of them focuses the field.

## Copy

No new strings.
