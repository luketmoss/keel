/* #199 — one string, two attributes, for a control whose only content is a
   glyph.

   Every icon-only control in a row already carried a correct, specific
   `aria-label`, so a screen reader user was told exactly what `⠿` and `⋮`
   do and a sighted mouse user was not. The fix is the same string as a
   native `title`.

   Spread rather than written twice at each call site, because the
   acceptance criterion is that the two *cannot* disagree — and two
   template literals sitting beside each other can always drift by a
   character. There is one place to change the wording of a control, and it
   changes both. */

export interface IconLabel {
  'aria-label': string
  title: string
}

/** The accessible name and the tooltip for an icon-only control, from one
    string. Name the row's subject in it — `Delete "Notch Mountain"
    permanently`, never a bare `Delete` — since the tooltip appears over a
    list where every row carries the same glyphs. */
export function iconLabel(label: string): IconLabel {
  return { 'aria-label': label, title: label }
}
