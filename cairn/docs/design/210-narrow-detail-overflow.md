# 210 — the narrow detail face scrolls instead of overflowing

**Revises** [197-seeing-the-photo.md](197-seeing-the-photo.md)'s "detail face,
narrow" section, which specified the photo's `60vh` cap but left what happens
when photo + detail together still exceed the dialog unspecified. That gap is
this bug: the dialog grows past its own `max-height` and the tail of the
detail content becomes unreachable.

Standing documents: [design-language.md](design-language.md) (tokens),
[cairns.md](cairns.md) (the detail face's contents).

## The fix, in one sentence

The narrow layout gets the same shape the wide layout already has: the photo
keeps its cap and is never scrolled out of view, and the detail column scrolls
internally when its content — combined with the capped photo — doesn't fit
inside the dialog.

## Main path

Below `--photo-split` (900px), opening a photo cairn whose name, meta,
description, position sentence, icon grid, and (where present) `Remove from
trip` fit comfortably under the photo: unchanged from today. No scrollbar, no
layout shift.

## The overflow state

Same viewport, a cairn whose detail content is long enough that photo (at its
`60vh` cap) plus detail together exceed the dialog's `max-height`
(`calc(100vh - var(--space-8) * 2)`):

- The dialog itself stops growing at its cap — it never renders taller than
  that, matching the wide layout's dialog, which also never exceeds it.
- The photo stays at its full `60vh` cap. It does not shrink further to make
  room, and it is never scrolled out of view — the same rule
  [197](197-seeing-the-photo.md) states for the wide layout's image column
  ("The photo must never scroll out of view on the surface whose job is
  showing it") applies here too; there is no reason the narrow layout should
  hold the photo to a lower standard than the wide one.
- `.lightbox__detail` becomes its own scroll region for whatever doesn't fit
  in the remaining space — `overflow-y: auto`, the same property the wide
  layout already applies to this element under the `min-width: 900px` query,
  now applied below it as well.
- No visible scrollbar affordance beyond the browser's own (native, per the
  design language's precedent elsewhere) — nothing new is drawn to signal
  scrollability.

## Mechanism (for whoever implements this)

`.lightbox__frame` is a flex item of `.lightbox__dialog` (a flex column below
the breakpoint). Its automatic minimum size — image content size — currently
wins over its own `max-height: 60vh` when the flex container is squeezed,
because nothing tells it it's allowed to shrink. Adding `min-height: 0` lets
its `max-height` actually govern.

That alone stops the frame from forcing the dialog taller, but doesn't make
the detail content reachable — for that, `.lightbox__detail` needs its own
`overflow-y: auto` below the breakpoint, sized to whatever height remains once
the frame and the dialog's own padding are subtracted. This is the same
technique the wide layout's `min-width: 900px` block already uses on the same
element; the fix is applying it unconditionally rather than only above the
breakpoint.

## Edge cases

- **Content short enough to fit.** No scroll region takes effect —
  `overflow-y: auto` on a non-overflowing element draws nothing extra. Visibly
  identical to today.
- **Crossing `--photo-split` while open** (existing edge case from #197,
  unaffected by this fix): the layout swaps between "detail scrolls
  internally, dialog fixed" (narrow) and "detail scrolls internally, image
  column fills the rest" (wide) — both already this same shape after this fix,
  so the swap is uneventful. Nothing closes, nothing reloads.
- **Full bleed.** Unreachable from this state's description column, since full
  bleed hides `.lightbox__detail` entirely (per #197) — this fix does not
  touch full bleed at all.
- **A field is mid-edit (`NameInput`/`DescriptionInput`, #196) when the detail
  column is scrolled.** The input is inside the scroll region like everything
  else; no special handling — it scrolls with its container same as any other
  child.

## Out of scope

Changing the `60vh` cap or `--photo-split` value; any redesign of what the
detail column contains; the wide layout and full bleed, both already correct.
