# 195 — the lightbox's controls over the photo

The close, previous and next controls paint behind the image. This note decides
what they look like once they are in front of it.

Standing documents that govern this: [design-language.md](design-language.md)
for the treatment, [cairns.md](cairns.md) for what the surface is. The lightbox
itself was specified in [55-photo-list-lightbox.md](55-photo-list-lightbox.md)
and extended into a cairn's detail face by
[155-cairns-replace-photos.md](155-cairns-replace-photos.md); neither is
contradicted here.

## The problem in one line

`.lightbox__control` is absolutely positioned with no `z-index`, and
`.lightbox__frame` is `position: relative` and later in DOM order, so the image
wins the paint order at every size.

## The main path

The lightbox opens. The close control sits at the dialog's top-right, the arrows
at its vertical centre left and right, all three **over** the image, all three
legible, all three clickable. Nothing about where they sit changes — only what
they sit on top of, and what they sit on.

## The treatment

A control over an arbitrary photograph cannot borrow its contrast from the
dialog, because the dialog is not what is behind it any more. `--text` on a
snow field is invisible; `--text` on a night shot is fine. The control has to
carry its own ground.

**Each control gets a circular scrim of its own.**

| Property | Value |
|---|---|
| Shape | `--radius-full`, at the existing `--hit-target` square |
| Rest fill | `--control-scrim` (new token, below) |
| Rest glyph | `--text` |
| Hover | `--control-scrim-hover` (new token) |
| Pressed | `--pressed` composited over the rest fill, per the language |
| Focus | the global 2px `--accent` outline at 2px offset, unchanged |
| Disabled | `opacity: 0.4`, `cursor: default`, no hover — unchanged, and the arrows stay rendered rather than hidden so the frame cannot reflow |

`--radius-full` rather than `--radius-sm`: over a photograph a circle reads as a
control belonging to the viewer, and a rounded square reads as a crop artefact
of the image beneath it. This is the one place in the app where a control has no
panel behind it, so it is not a departure from the language's radius scale so
much as a case the scale never covered.

The scrim is dark rather than light in both cases. A single treatment that works
over any photo is worth more than two that each work over half of them, and the
language's ground is cold and dark, so a dark scrim with `--text` on it is the
one that stays recognisably cairn's.

**Elevation is L2's material without L2's shadow.** A shadow under a 40px circle
is the "visible as an outline" failure design-language.md warns about; the scrim
is doing the separating.

## New tokens

| Token | Value | For |
|---|---|---|
| `--control-scrim` | `color-mix(in srgb, var(--ground) 72%, transparent)` | the rest fill behind a control that floats over image content |
| `--control-scrim-hover` | `color-mix(in srgb, var(--ground) 88%, transparent)` | its hover fill |

Derived from `--ground` by `color-mix`, per the language's "derived states are
mixed, never hand-picked" rule, so a palette change carries.

The worst case for a dark scrim is a pure-white photo. 72% `--ground` over white
composites to roughly `#545661`, and `--text` on that is **6.5:1** — AA at every
size, with margin. Over any darker photo it only improves, bottoming out at
`--text` on `--ground` itself. Re-check this figure if `--ground` or `--text`
moves, the same way the language's own tightest pair is re-checked.

`--scrim` already exists for the full-viewport backdrop and is not reused here:
that one is tuned to leave the map readable behind it, and a control that leaves
the photo readable through it is exactly the bug.

## Layering

One rule, written once:

> **Every `.lightbox__control` paints above `.lightbox__frame`.**

`z-index: 1` on `.lightbox__control` is enough — the frame creates a stacking
context at `z-index: auto`, and the dialog is the shared parent. Do not raise
the frame's own z-index to "fix" this from the other side; the frame is
positioned only so `.lightbox__error` can anchor to it.

## States

| State | Close | Prev / Next |
|---|---|---|
| Original loaded | Over the image, scrim visible | Over the image, scrim visible |
| Original loading (blurred thumbnail placeholder) | Same | Same |
| Original failed (`Couldn't load this photo.`) | Same | Same |
| A photo is uploading onto this cairn (#157) | Same — closing mid-upload is allowed and already was | Same |
| First row in the list | Same | Prev disabled at `opacity: 0.4`, still drawn |
| Last row in the list | Same | Next disabled at `opacity: 0.4`, still drawn |
| Only one row | Same | Both disabled, both drawn |
| Icon-only cairn, no image at all | Scrim still present | Scrim still present |

The scrim does not disappear when there is no image behind it. A control that
changes shape depending on whether a cairn has a photo is a second thing to
learn for no gain, and the icon-only case is reachable from the list.

## Edge cases

- **A photo narrower than the dialog.** The controls sit over the dialog's own
  `--surface` rather than the image. The scrim is visible against it and that is
  fine — it reads as a control, not as damage.
- **A very tall photo.** The arrows sit at 50% of the dialog, which on a tall
  photo is over the middle of the image. This is the case the fix exists for.
- **Rapid arrow presses.** Unchanged: the component stays mounted and only `row`
  changes, so the controls do not re-mount and focus does not move.
- **Reduced motion.** The controls have no motion beyond the language's colour
  transitions at `--motion-fast`, which the global reduced-motion block already
  collapses.
- **Touch.** `--hit-target` is unchanged at 40px, which is already the
  language's floor.

## Copy

No new strings. The existing `aria-label`s stand: `Close photo`,
`Previous photo`, `Next photo`.

## Out of scope

How large the photo renders (#197), and editing the cairn's name or description
from this surface (#196). Both land on this file and both leave this decision
alone.
