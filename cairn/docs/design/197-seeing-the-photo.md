# 197 — seeing the photo

The cairn detail face gives the photograph the space that already exists, and
gains a full-bleed view for when even that is not enough.

Standing documents: [cairns.md](cairns.md) (the detail face's contents),
[design-language.md](design-language.md) (elevation, motion, scale),
[shell-and-content-model.md](shell-and-content-model.md) (the column, mobile).
Prior notes: [55-photo-list-lightbox.md](55-photo-list-lightbox.md) — **revised
here** — [155-cairns-replace-photos.md](155-cairns-replace-photos.md),
[157-photo-onto-a-cairn.md](157-photo-onto-a-cairn.md),
[49-motion-elevation.md](49-motion-elevation.md).

**Depends on [195-lightbox-controls.md](195-lightbox-controls.md).** That note
puts the close and arrow controls in front of the image and gives them a scrim.
The full-bleed view below has no panel behind its controls at all, so it is only
buildable once that is true.

**What this revises in #55.** Its "Contents" section stacks the image over a
caption in one column, and `max-height: 70vh` was the right cap when a caption
was all that sat beneath it. Since #157 and #169 the same column carries a whole
detail face, and the cap is now a floor on how much chrome can crowd the photo.
The lightbox's other decisions — the scrim, the L2 material, arrow navigation
without wrapping, focus management, the blurred-thumbnail placeholder — stand
unchanged and are inherited by both layouts below.

## Two layouts and a mode

```
       detail face, wide            detail face, narrow        full bleed
┌──────────────┬─────────┐        ┌──────────────────┐      ┌──────────────┐
│              │  name   │        │                  │      │              │
│              │  meta   │        │      photo       │      │              │
│    photo     │  descr. │        │                  │      │    photo     │
│              │  posn.  │        ├──────────────────┤      │              │
│              │  icons  │        │ name / meta / …  │      │              │
│              │  remove │        │                  │      │              │
└──────────────┴─────────┘        └──────────────────┘      └──────────────┘
```

The detail face is one component with one responsive layout. Full bleed is a
mode of that component, not a fourth surface — it shows the same cairn, keeps
the same arrow navigation, and returns to the face it came from.

## The detail face, wide

**Breakpoint:** `--photo-split` (new token, `900px`). Above it, two columns.

| Region | Sizing |
|---|---|
| Dialog | `margin: --space-8`; `max-width: calc(100vw - --space-8 * 2)`; `max-height: calc(100vh - --space-8 * 2)` — unchanged |
| Image column | `flex: 1`, `min-width: 0` — takes everything the detail column does not |
| Gap | `--space-6` |
| Detail column | `flex: none`, `width: --panel-width` (380px), scrolls internally if its own content overflows |
| Image | `max-width: 100%`, `max-height: 100%`, `object-fit: contain`, **never upscaled beyond natural size** |

The image's cap becomes the dialog, not a fraction of the viewport. `70vh` goes
away in the wide layout: with nothing stacked beneath it there is nothing left
for the cap to protect.

**Reusing `--panel-width` for the detail column** rather than inventing a width:
it is the column this content was designed against and already reads well at,
and it means a cairn's detail reads the same width whether it is in the sidebar
(loose, via `LooseFace`) or here.

The detail column, not the dialog, is what scrolls when the icon grid and a long
description exceed the height. The photo must never scroll out of view on the
surface whose job is showing it.

## The detail face, narrow

Below `--photo-split`, the current single column, in the current order. The
image keeps a cap so the detail beneath it is reachable without scrolling past a
full screen of photograph:

- `max-height: 60vh` — down from 70, because on a narrow viewport the name and
  meta line matter more than the last tenth of the image, and full bleed is one
  tap away.

Everything else in this layout is what ships today.

## Full bleed

Entered by **clicking the photo**, on either layout. Left by clicking it again,
by Escape, or by the close control.

| Property | Value |
|---|---|
| Backdrop | `--scrim`, full viewport — the map stays faintly visible, as the lightbox's already does |
| Photo | Fit to the viewport with `--space-4` of breathing room, `object-fit: contain`, never upscaled |
| Chrome | The close control and the two arrows, in #195's treatment, and nothing else |
| Elevation | No dialog, no `--surface`, no radius, no shadow. The photo is the surface |
| Motion | The photo scales from its detail-face box to its full-bleed box over `--motion-base`; the detail column fades out over `--motion-fast` |

**No name, no meta, no description.** They are one Escape away, and a caption
over a photograph is the thing this mode exists to get rid of. The `aria-label`
on the dialog still carries the cairn's name, so the mode is not anonymous to a
screen reader.

**Escape is innermost-first.** In full bleed it returns to the detail face; on
the detail face it closes. Two Escapes from full bleed close everything, and
neither one skips a level.

**Only a cairn with an image has this mode.** An icon-only cairn's image slot is
not a button, has no `cursor: zoom-in`, and cannot be entered by any means.

## States

| State | Detail face, wide | Full bleed |
|---|---|---|
| Original loaded | Photo fills its column | Photo fills the viewport |
| Original loading | Blurred thumbnail, scaled, in the same box — **no reflow when the original lands** | Same |
| Original failed | `Couldn't load this photo.` over the blurred thumbnail | Same, and the mode is still enterable and leavable |
| No image (icon-only) | Image column is absent; the detail column takes the dialog at `--panel-width` | Not reachable |
| Photo uploading onto this cairn (#157) | The existing 4:3 uploading slot occupies the image column, dimmed image beneath, `uploading…` label | Not reachable while uploading |
| Portrait photo, wide viewport | Fills the column's height; the column is wider than the photo and the photo is centred | Fills the viewport's height |
| Very small original (e.g. 400px wide) | Drawn at natural size, centred. **Never upscaled** — #55's rule, and it is what stops a small photo looking like a rendering fault | Same |
| First / last in the list | Arrows disabled, still drawn | Same |
| Disconnected | Whatever is cached still shows; the icon grid and `Remove from trip` take the Disabled treatment, per #73 | Unaffected — viewing reads nothing |

## Edge cases

- **The viewport crosses `--photo-split` while open.** The layout swaps. Nothing
  closes, nothing reloads, the same cairn stays open. The image element is the
  same node in both layouts so the browser does not re-fetch.
- **Full bleed while the viewport is resized below the breakpoint.** Full bleed
  has no breakpoint; it is the same in both. Leaving it lands on whichever
  layout now applies.
- **Arrow to a cairn with no image while in full bleed.** Full bleed exits and
  the detail face shows, on the new cairn. A mode whose whole content is absent
  is not a state to sit in. This is reachable — the list mixes photo cairns and
  icon-only ones — so it is specified rather than left to fall out.
- **A photo is dropped onto the cairn while in full bleed.** Full bleed exits;
  the upload's progress belongs on the detail face where #157 put it.
- **Clicking the arrows in full bleed.** Navigates, stays in full bleed. Only a
  click on the photo itself leaves.
- **A click that is a drag.** Not applicable — the photo is not draggable and
  the marker drag (#158) is on the map, behind the scrim.
- **Reduced motion.** The scale transition collapses under the global block; the
  mode change is instant. Nothing else in this note has motion.
- **Touch.** Tap is the click. There is no pinch-to-zoom handling — see Out of
  scope. The browser's own page zoom is not intercepted.
- **A 6000×4000 original on a phone.** Unchanged from today: the same
  `usePhotoImage` fetch, the same blurred-thumbnail placeholder while it lands.
  #187 already downscales on import, so this is bounded at the source.

## Copy

| String | Where |
|---|---|
| `View full size` | The image's `aria-label` on the detail face, when it has an image |
| `Exit full size` | The photo's `aria-label` in full bleed |
| `Couldn't load this photo.` | Unchanged |

No visible copy is added. `cursor: zoom-in` on the detail face's image and
`cursor: zoom-out` in full bleed are the affordance; a `View full size` button
beside a photograph is a caption by another name.

## New tokens

| Token | Value | For |
|---|---|---|
| `--photo-split` | `900px` | The viewport width at or above which a cairn's detail face is two columns |

900px is where `--panel-width` (380) plus `--space-6` (24) plus the dialog's own
margins and padding (112) leaves roughly 380px for the photo — the point below
which the photo would be no larger side-by-side than stacked, so the split stops
earning its complexity.

The detail column's width is `--panel-width`, reused. The image column has no
token: it is what is left.

## Out of scope

Pan and zoom within a photo, a slideshow, download or export, EXIF detail, and
the sidebar's thumbnail sizes. The controls' own treatment over the image is
#195's and is depended on, not redone. Editing name or description is #196's.
