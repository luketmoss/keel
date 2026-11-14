# 882 — Eaten: edit an entry's amount in place

Specifies [#882](https://github.com/luketmoss/keel/issues/882), part of epic [#876](https://github.com/luketmoss/keel/issues/876).
The Eaten day view, entry rows, the Amount sheet and its dry-run preview are [`712-food-log.md`](712-food-log.md); the
"busy, then patch, close and toast together, then a quiet refresh" rule is [`785-instant-saves.md`](785-instant-saves.md).
Neither is restated. Tokens, spacing and touch targets come from [`suite-language.md`](../../../ui/docs/design/suite-language.md).
Layout reference: the prototype at `876-usuals-prototype.html` (tab 2, any entry's amount chip). Every length is a
token; nothing here introduces one.

## Why

Changing an amount means opening the Amount sheet for each entry. When a usual adds four foods (#885), adjusting two of
them is two sheets. The owner wants to see the serving and change it without opening anything.

## The entry row

Line two of a food entry (today `1 tbsp · 16 g` as text) becomes the **amount chip**:

- A button, `--radius-full`, `--color-surface-raised` fill (the track tint the prototype uses), `--text-sm`, tabular
  figures, padding `--space-xs` by `--space-sm`, with at least a 44px tall hit area (the visible chip can be smaller;
  pad the target).
- Text: `<qty> <serving>` then ` · <grams> g` in `--color-text-secondary`, as today (`½ cup · 40 g`). In grams it is
  only `<grams> g`.
- `aria-expanded` follows the editor. Accessible name: `Amount, 1 tbsp, 16 grams. Edit`.
- Open: `--color-primary-light` fill, `--color-primary` text.
- A **recipe entry**'s chip reads `1 serving` and opens the same editor without unit pills.
- An entry for a deleted food (#712's `A removed food`) has no chip; line two stays text.

Tapping **anywhere else on the row** still opens #712's Amount sheet, unchanged (move to another meal, delete, More
nutrition). Only the chip opens the inline editor. Chosen over replacing the sheet: the sheet still has jobs the inline
editor doesn't, and the chip is a clear, separate target.

## The inline editor

Opens directly under the row, inside the meal card, full card width, `--color-surface-raised`, `--radius-md`,
padding `--space-sm`, gap `--space-sm`. One editor is open at a time in the whole day: opening another closes the
first (saving it, below).

Top to bottom:

1. **Stepper row:** minus (44px), the quantity in `--text-lg` bold tabular (`1½`, `¾`, or grams as a whole number),
   plus (44px), then the unit and grams in `--color-text-secondary` (`tbsp · 24 g`).
   - Steps for a serving unit: 0.25 below 1, 0.5 from 1 up, minimum 0.25, maximum 99. Grams: 5 g steps, minimum 5,
     maximum 5000.
   - Quantities show as `¼ ½ ¾` fractions where exact, otherwise up to two decimals.
2. **Unit pills:** one per named serving in `servings_json` order (`tbsp (16 g)`), then `grams`. Single-select,
   `aria-pressed`. Switching keeps the weight: the new quantity is the old grams over the new serving's grams,
   rounded to the nearest 0.25 (grams: nearest 5).
3. **Done**, a text button at the right.

While the editor is open, the row's calories show the **preview**: `updateLogEntry` with `dry_run: true`, requested 400ms
after the last change, exactly as the Amount sheet's preview. While one is out, the old figure stays and the chip's
grams update at once (they are local arithmetic on the serving's grams).

## Saving

- **Done**, opening another entry's editor, opening any sheet, or tapping the chip again closes the editor. If the
  amount differs from what is stored, it saves with `updateLogEntry` (`qty`, `unit`).
- Saving follows #785: the editor shows the new amount disabled with `aria-busy` on Done for the moment of the call,
  then in one update the row shows the stored entry from the reply and the editor closes. The day card and the meal's
  totals refresh quietly. No toast: the change is in view. Chosen over a toast because the row itself is the
  confirmation and a toast per nudge would be noise.
- No change: closing does nothing.
- **Save failed:** the editor stays open with `Couldn't save. Try again.` in `--color-danger-text`, `role="status"`,
  under the pills; the row keeps its stored figures.
- Leaving the day (arrows, another tab, the app going to the background) with an editor open and a change pending saves
  it, the same as Done.

## States

| State | Shows |
|---|---|
| Closed | The chip |
| Open, unchanged | The editor; calories as stored |
| Open, changed, preview out | New grams on the chip; old calories |
| Open, changed, preview back | New calories on the row |
| Preview failed | Old calories stay; no message (the save is still allowed) |
| Saving | Done disabled with `aria-busy`; stepper and pills disabled |
| Save failed | The error line; editor stays open |

## Edge cases

- A food with no named servings: only `grams` shows, selected.
- A unit stored on the entry that the food no longer has (a renamed serving, #880, #883): the first pill is that
  stored unit, labelled with its grams per unit from the entry (`serving (32 g)`), so the entry still reads right. Picking
  any other unit converts as above.
- A food with no nutrition: the chip and editor work; the row's calories stay `—`.
- Rapid taps on plus: each changes the number at once; one preview request goes out 400ms after the last tap.
- 375px wide: the pills wrap onto more lines; nothing scrolls sideways.

## Copy

`Amount, <qty> <unit>, <grams> grams. Edit` (chip name) · `Less` / `More` (stepper names) · `grams` · `Done` ·
`Couldn't save. Try again.`
